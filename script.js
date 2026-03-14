/**
 * Ringvoo landing page — client script
 * Handles: theme, nav scroll, hero flag cycle, dialer (Twilio Device), modals, FAQ, toast, scroll reveal.
 * Backend: token + balance + rates (optional). UI/UX unchanged if backend unavailable.
 */
const BACKEND_URL = 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Theme (light/dark) — persisted in localStorage
// ---------------------------------------------------------------------------
/** Toggle data-theme on documentElement and persist to localStorage. */
function toggleTheme(){
  const d = document.documentElement;
  const dk = d.getAttribute('data-theme') === 'dark';
  d.setAttribute('data-theme', dk ? 'light' : 'dark');
  localStorage.setItem('rvt', dk ? 'light' : 'dark');
}
(function initTheme() {
  const t = localStorage.getItem('rvt');
  if (t) document.documentElement.setAttribute('data-theme', t);
})();

// ---------------------------------------------------------------------------
// Nav — scroll state and mobile menu toggle
// ---------------------------------------------------------------------------
window.addEventListener('scroll', function () {
  document.getElementById('mainNav').classList.toggle('scrolled', window.scrollY > 20);
});

function toggleNavMenu() {
  var menu = document.getElementById('navMenu');
  var btn = document.getElementById('navToggle');
  if (!menu || !btn) return;
  var isOpen = menu.classList.toggle('open');
  btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  document.body.style.overflow = isOpen ? 'hidden' : '';
}

function closeNavMenu() {
  var menu = document.getElementById('navMenu');
  var btn = document.getElementById('navToggle');
  if (!menu || !btn) return;
  menu.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

document.addEventListener('click', function (e) {
  var menu = document.getElementById('navMenu');
  if (!menu || !menu.classList.contains('open')) return;
  var nav = document.getElementById('mainNav');
  if (nav && !nav.contains(e.target)) closeNavMenu();
});
window.addEventListener('resize', function () {
  if (window.innerWidth > 768) closeNavMenu();
});

// ---------------------------------------------------------------------------
// Hero — rotate country label in CTA button
// ---------------------------------------------------------------------------
const flags = [
  { label: 'United States' },
  { label: 'United Kingdom' },
  { label: 'Australia' },
  { label: 'Nigeria' },
  { label: 'Brazil' },
  { label: 'Japan' },
  { label: 'Germany' },
  { label: 'United Arab Emirates' },
  { label: 'India' }
];
let fi = 0;
setInterval(function () {
  fi = (fi + 1) % flags.length;
  const f = flags[fi];
  document.getElementById('flagDisplay').textContent = f.label;
}, 2000);

// ---------------------------------------------------------------------------
// Dialer state (Twilio Device, call, timer, UI flags)
// ---------------------------------------------------------------------------
let num = '';
let device = null;
let activeCall = null;
let timerInt = null;
let timerSec = 0;
let isOnline = false;
let isMuted = false;
let pending = null;
let inCall = false;
let inputMode = 'num';

const dialCountries = {
  US: { flag: '\uD83C\uDDFA\uD83C\uDDF8', code: '+1', label: 'United States', rate: '$0.02/min' },
  GB: { flag: '\uD83C\uDDEC\uD83C\uDDE7', code: '+44', label: 'United Kingdom', rate: '$0.02/min' },
  CA: { flag: '\uD83C\uDDE8\uD83C\uDDE6', code: '+1', label: 'Canada', rate: '$0.02/min' },
  AU: { flag: '\uD83C\uDDE6\uD83C\uDDFA', code: '+61', label: 'Australia', rate: '$0.04/min' },
  DE: { flag: '\uD83C\uDDE9\uD83C\uDDEA', code: '+49', label: 'Germany', rate: '$0.02/min' },
  IN: { flag: '\uD83C\uDDEE\uD83C\uDDF3', code: '+91', label: 'India', rate: '$0.01/min' }
};
let currentDialCountry = 'US';

// ---------------------------------------------------------------------------
// Dialer tabs — switch between Dial and Recent
// ---------------------------------------------------------------------------
function switchTab(tab) {
  document.getElementById('tabDial').classList.toggle('active',tab==='dial');
  document.getElementById('tabRecent').classList.toggle('active',tab==='recent');
  document.getElementById('dialPanel').style.display=tab==='dial'?'block':'none';
  document.getElementById('recentPanel').style.display=tab==='recent'?'block':'none';
}

const alphaMap = {
  '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ'
};
let lastAlphaKey = null;
let lastAlphaTime = 0;

// ---------------------------------------------------------------------------
// Keypad — digit/alpha input, backspace, clear, dial from recent
// ---------------------------------------------------------------------------
function kp(k) {
  if(num.length>=20)return;
  if(inputMode==='alpha' && alphaMap[k]){
    const now=Date.now();
    const group=alphaMap[k];
    // if same key pressed again within 1.2s, rotate last letter
    if(lastAlphaKey===k && now-lastAlphaTime<1200 && num.length){
      const current=num[num.length-1];
      const idx=group.indexOf(current);
      const next=group[(idx+1+group.length)%group.length]||group[0];
      num=num.slice(0,-1)+next;
    }else{
      num+=group[0];
    }
    lastAlphaKey=k;
    lastAlphaTime=now;
    renderNum();
    return;
  }
  num+=k;
  renderNum();
}
function bs(){num=num.slice(0,-1);renderNum()}
function clearNum(){num='';renderNum()}
function dialTo(n){num=n;renderNum();switchTab('dial');document.querySelector('.dialer-card').scrollIntoView({behavior:'smooth',block:'center'})}

function renderNum(){
  const input=document.getElementById('numInput');
  if(input)input.value=num;
  const bsBtn=document.getElementById('backspaceBtn');
  if(bsBtn)bsBtn.disabled=!num;
  const clearBtn=document.getElementById('clearNumBtn');
  if(clearBtn)clearBtn.style.display=num?'inline-flex':'none';
  updateCallBtn();
}

function updateCallBtn(){
  const btn=document.getElementById('bigCallBtn');
  if(inCall){
    btn.className='d-big-call-btn calling';
    document.getElementById('callBtnIcon').innerHTML='<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.99.4 2.05.63 3.13.69a2 2 0 0 1 2 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.31-2.59m-2.51-4.02A19.79 19.79 0 0 1 1.64 3.42 2 2 0 0 1 3.62 1.25h3a2 2 0 0 1 2 1.72c.06.58.14 1.15.25 1.71M1 1l22 22"/>';
  } else if(isOnline&&num){
    btn.className='d-big-call-btn ready';
    document.getElementById('callBtnIcon').innerHTML='<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>';
  } else {
    btn.className='d-big-call-btn';
    document.getElementById('callBtnIcon').innerHTML='<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>';
  }
}

function callOrHangup(){
  if(inCall){hangup();return}
  if(!isOnline){showToast('Go online first to make a call','e');return}
  if(!num){showToast('Enter a number to call','e');return}
  makeCall();
}

document.addEventListener('keydown',e=>{
  const t=e.target;
  const isEditable=t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable;
  // Global shortcuts only when not typing in any input/textarea/contentEditable
  if(isEditable)return;
  if(inputMode==='alpha' && /^[a-zA-Z]$/.test(e.key)){
    if(num.length>=20)return;
    num+=e.key.toUpperCase();
    renderNum();
    return;
  }
  if('0123456789*#'.includes(e.key)){kp(e.key);return}
  if(e.key==='+'){kp('+');return}
  if(e.key==='Backspace'){e.preventDefault();bs();return}
  if(e.key==='Enter')callOrHangup();
});

document.getElementById('numInput').addEventListener('input',function(){
  const re=inputMode==='alpha'?/[^0-9+*#A-Za-z]/g:/[^0-9+*#]/g;
  num=this.value.replace(re,'');
  this.value=num;
  renderNum();
});

function toggleInputMode(){
  inputMode=inputMode==='num'?'alpha':'num';
  const btn=document.getElementById('modeToggleBtn');
  // Show the *current* input mode: 123 = numeric, ABC = alphabetic
  btn.textContent=inputMode==='num'?'123':'ABC';
  btn.classList.toggle('active',inputMode==='alpha');
  const kp=document.querySelector('.d-keypad');
  if(kp){
    kp.classList.toggle('alpha-mode',inputMode==='alpha');
    kp.classList.toggle('numeric-mode',inputMode==='num');
  }
}

function toggleCcDropdown(){
  document.getElementById('ccDropdown').classList.toggle('open');
}
function selectDialCountry(code){
  const cfg=dialCountries[code]||dialCountries.US;
  currentDialCountry=code;
  document.getElementById('ccFlag').textContent=cfg.flag;
  document.getElementById('ccCode').textContent=cfg.code;
  const rateEl=document.querySelector('.d-rate-hint');
  if(rateEl){
    rateEl.innerHTML = cfg.label + ' \u2014 starting at <span>' + cfg.rate + '</span>';
  }
  document.getElementById('ccDropdown').classList.remove('open');
}

function toggleCallerDropdown(){
  document.getElementById('callerDropdown').classList.toggle('open');
}
function selectCallerProfile(key){
  const dropdown=document.getElementById('callerDropdown');
  const labelEl=document.getElementById('callerSelTxt');
  if(key==='buy'){
    dropdown.classList.remove('open');
    openBuyNumberModal();
    return;
  }
  if(key==='custom'){
    dropdown.classList.remove('open');
    openCustomCallerModal();
    return;
  }
  // Only simple profiles like "public" actually change the label
  const map={public:'Public number'};
  const label=map[key]||labelEl.textContent;
  labelEl.textContent=label;
  dropdown.classList.remove('open');
}

function selectVerifiedCaller(numberLabel){
  document.getElementById('callerSelTxt').textContent=numberLabel;
  document.getElementById('callerDropdown').classList.remove('open');
}

function openContactModal(){
  const m=document.getElementById('contactModal');
  m.classList.add('show');
}
function closeContactModal(){
  const m=document.getElementById('contactModal');
  m.classList.remove('show');
}
function saveContact(e){
  e.preventDefault();
  const name=document.getElementById('contactName').value.trim();
  const number=document.getElementById('contactNumber').value.trim();
  if(!number){
    showToast('Please enter a number to save.','e');
    return;
  }
  num=number;
  renderNum();
  closeContactModal();
  showToast(`Saved ${name||'contact'} and filled number.`,'s');
}

function openCustomCallerModal(){
  document.getElementById('customCallerModal').classList.add('show');
}
function closeCustomCallerModal(){
  document.getElementById('customCallerModal').classList.remove('show');
}
function submitCustomCaller(){
  const val=document.getElementById('customCallerInput').value.trim();
  if(!val){
    showToast('Enter a number to verify.','e');
    return;
  }
  showToast('We will verify this caller ID in the backend later.','i');
  closeCustomCallerModal();
}
function deleteCustomCaller(btn){
  const row=btn.closest('.modal-list-row');
  if(row){
    const num=row.querySelector('.modal-list-num');
    showToast((num?num.textContent:'Caller ID')+' removed.','i');
    row.remove();
  }
}

function openBuyNumberModal(){
  document.getElementById('buyNumberModal').classList.add('show');
}
function closeBuyNumberModal(){
  document.getElementById('buyNumberModal').classList.remove('show');
}

// ---------------------------------------------------------------------------
// Go online — Twilio Device token, ready/error/disconnect/incoming
// ---------------------------------------------------------------------------
async function goOnline() {
  const btn=document.getElementById('goOnlineBtn');
  if(isOnline){
    device&&device.destroy();device=null;
    setOfflineUI();showToast('You are now offline.','i');return;
  }
  btn.querySelector('span:last-child').textContent='Connecting…';
  btn.disabled=true;
  try{
    const r=await fetch(`${BACKEND_URL}/token?identity=user_${Date.now()}`);
    if(!r.ok)throw 0;
    const d=await r.json();
    device=new Twilio.Device(d.token,{codecPreferences:['opus','pcmu'],enableRingingState:true});
    device.on('ready',()=>{setOnlineUI();showToast("You're live! Ready to call.",'s');fetchBal()});
    device.on('error',err=>{showToast('Error: '+err.message,'e');setOfflineUI()});
    device.on('disconnect',endCallUI);
    device.on('incoming',handleIn);
  }catch(_){
    showToast('Cannot connect — is the backend running?','e');
    btn.querySelector('span:last-child').textContent='Go Online';
    btn.disabled=false;
  }
}
function setOnlineUI(){
  isOnline=true;
  const btn=document.getElementById('goOnlineBtn');
  btn.disabled=false;
  btn.classList.add('online');
  document.getElementById('statusDot').className='d-status-dot online';
  document.getElementById('statusTxt').textContent='Online';
  updateCallBtn();
}
function setOfflineUI(){
  isOnline=false;
  const btn=document.getElementById('goOnlineBtn');
  btn.disabled=false;
  btn.classList.remove('online');
  document.getElementById('statusDot').className='d-status-dot';
  document.getElementById('statusTxt').textContent='Go Online';
  updateCallBtn();
}

// ---------------------------------------------------------------------------
// Make call / hangup — overlay, timer, mute, speaker
// ---------------------------------------------------------------------------
function makeCall() {
  if(!device||!num)return;
  activeCall=device.connect({To:num});
  activeCall.on('ringing',()=>showCallOv(num,'Ringing…'));
  activeCall.on('accept',()=>{document.getElementById('ovStatus').textContent='Connected';startTimer()});
  activeCall.on('disconnect',endCallUI);
  activeCall.on('error',e=>{showToast('Call error: '+e.message,'e');endCallUI()});
  inCall=true;updateCallBtn();
  showCallOv(num,'Connecting…');
}
function hangup(){activeCall?activeCall.disconnect():device&&device.disconnectAll();endCallUI()}
function showCallOv(n,s){
  document.getElementById('ovNum').textContent=n;
  document.getElementById('ovStatus').textContent=s;
  document.getElementById('ovTimer').innerHTML='&nbsp;';
  document.getElementById('callOverlay').classList.add('show');
}
function endCallUI(){
  inCall=false;
  document.getElementById('callOverlay').classList.remove('show');
  stopTimer();
  if(isOnline)fetchBal();
  updateCallBtn();
}
function startTimer(){
  timerSec=0;
  timerInt=setInterval(()=>{
    timerSec++;
    const m=String(Math.floor(timerSec/60)).padStart(2,'0'),s=String(timerSec%60).padStart(2,'0');
    document.getElementById('ovTimer').textContent=m+':'+s;
  },1000);
}
function stopTimer(){clearInterval(timerInt);timerSec=0}
function toggleMute(){if(!activeCall)return;isMuted=!isMuted;activeCall.mute(isMuted);document.getElementById('ovMuteBtn').classList.toggle('active',isMuted)}
function toggleSpeaker(){document.getElementById('ovSpkBtn').classList.toggle('active')}

// ---------------------------------------------------------------------------
// Incoming call — accept/decline popup
// ---------------------------------------------------------------------------
function handleIn(c) {pending=c;const p=document.getElementById('inPopup');p.style.display='block';requestAnimationFrame(()=>p.classList.add('show'))}
function acceptCall(){if(!pending)return;pending.accept();activeCall=pending;pending=null;hideIn();inCall=true;showCallOv(activeCall.parameters.From||'Caller','Connected');startTimer();updateCallBtn()}
function declineCall(){pending&&pending.reject();pending=null;hideIn()}
function hideIn(){const p=document.getElementById('inPopup');p.classList.remove('show');setTimeout(()=>p.style.display='none',400)}

// ---------------------------------------------------------------------------
// Balance — fetch from backend and update display
// ---------------------------------------------------------------------------
async function fetchBal() {
  try{const r=await fetch(`${BACKEND_URL}/account/balance`);if(!r.ok)return;const d=await r.json();document.getElementById('balDisplay').textContent='$'+parseFloat(d.balance).toFixed(2)}catch(_){}
}

// ---------------------------------------------------------------------------
// Toast notification (success / error / info)
// ---------------------------------------------------------------------------
let tt;
function showToast(msg, type = 'i') {
  clearTimeout(tt);
  document.getElementById('tDot').className='tdot '+type;
  document.getElementById('tMsg').textContent=msg;
  const el=document.getElementById('toastEl');
  el.classList.add('show');
  tt=setTimeout(()=>el.classList.remove('show'),3400);
}

// ---------------------------------------------------------------------------
// Rates section — country dropdown, optional live API
// ---------------------------------------------------------------------------
function toggleRatesDropdown() {document.getElementById('ratesDropdown').classList.toggle('open')}
function selectCountry(flag,name,mobile,landline){
  document.getElementById('ratesFlag').textContent=flag;
  document.getElementById('ratesCountry').textContent=name;
  document.getElementById('rMobile').textContent=mobile;
  document.getElementById('rLandline').textContent=landline;
  document.getElementById('ratesDropdown').classList.remove('open');
  // try live API
  const isoMap={'United States':'US','United Kingdom':'GB','Australia':'AU','Germany':'DE','France':'FR','India':'IN','Nigeria':'NG','UAE':'AE','Japan':'JP','Canada':'CA','Brazil':'BR','Mexico':'MX','South Africa':'ZA','Pakistan':'PK','Ghana':'GH'};
  const iso=isoMap[name];
  if(iso){
    fetch(`${BACKEND_URL}/rates/country/${iso}`)
      .then(r=>r.json())
      .then(d=>{if(d.mobile)document.getElementById('rMobile').textContent=d.mobile;if(d.landline)document.getElementById('rLandline').textContent=d.landline})
      .catch(()=>{});
  }
}
document.addEventListener('click',e=>{if(!e.target.closest('.rates-sel-wrap'))document.getElementById('ratesDropdown').classList.remove('open')});
document.addEventListener('click',e=>{
  if(!e.target.closest('.d-cc-wrap'))document.getElementById('ccDropdown').classList.remove('open');
  if(!e.target.closest('.d-caller-wrap'))document.getElementById('callerDropdown').classList.remove('open');
});

// ---------------------------------------------------------------------------
// FAQ — accordion open/close
// ---------------------------------------------------------------------------
function faqToggle(btn) {const item=btn.closest('.faq-item');const open=item.classList.contains('open');document.querySelectorAll('.faq-item.open').forEach(i=>i.classList.remove('open'));if(!open)item.classList.add('open')}

// ---------------------------------------------------------------------------
// Scroll reveal — add .v when element enters viewport
// ---------------------------------------------------------------------------
const io = new IntersectionObserver(function (entries) {
  entries.forEach(function (x) {
    if (x.isIntersecting) {
      x.target.classList.add('v');
      io.unobserve(x.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -20px 0px' });
document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
