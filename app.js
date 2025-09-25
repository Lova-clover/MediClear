// app.js — 공통 UX
export const AppUX = (() => {
  const vibrate = ms => (navigator.vibrate ? navigator.vibrate(ms) : null);
  const mount = () => document.querySelector('.viewport') || document.body;

  // toast
  const toastEl = document.createElement('div');
  toastEl.className = 'toast'; mount().appendChild(toastEl);
  let toastTimer = null;
  function toast(msg, ms=2000){
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>toastEl.style.display='none', ms);
    vibrate(10);
  }

  // sheet
  const backdrop = document.createElement('div'); backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div'); sheet.className='sheet';
  sheet.innerHTML = `<div class="sheet-handle"></div><div id="sheet-body" style="padding:12px;"></div>`;
  const ensureMounted = () => { const root = mount(); if(!backdrop.parentNode){ root.append(backdrop, sheet); } }
  function openSheet(html){ ensureMounted(); document.getElementById('sheet-body').innerHTML=html; backdrop.style.display='block'; sheet.classList.add('open'); vibrate(8); }
  function closeSheet(){ sheet.classList.remove('open'); backdrop.style.display='none'; }

  // loader
  const loader = document.createElement('div'); loader.className='loader';
  loader.innerHTML = `<div class="row"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
  function loading(on){ const root = mount(); if(!loader.parentNode) root.appendChild(loader); loader.style.display = on ? 'flex' : 'none'; }

    // 헤더 투명 효과
    function enableHeaderTransparency(){
    const header = document.querySelector('.app-header');
    if(!header) return;
    window.addEventListener('scroll', ()=>{
        const y = window.scrollY || document.documentElement.scrollTop;
        if(y > 10) header.classList.remove('transparent');
        else header.classList.add('transparent');
    });
    }

    // mount 후 실행
    document.addEventListener('DOMContentLoaded', enableHeaderTransparency);

  
  // 하단 탭 active
  function setActiveNav(key){
    document.querySelectorAll('.nav a').forEach(a=>{
      a.classList.toggle('active', a.dataset.nav === key);
      a.setAttribute('aria-selected', a.classList.contains('active') ? 'true' : 'false');
    });
  }

  function logout(){ try { localStorage.clear(); } catch {} location.replace('login.html'); }

  function enablePullToRefresh(callback){
    let startY = 0, pulling = false;
    window.addEventListener('touchstart', e=>{
      if (document.documentElement.scrollTop === 0 || document.body.scrollTop === 0) {
        startY = e.touches[0].clientY; pulling=true;
      }
    }, {passive:true});
    window.addEventListener('touchmove', e=>{
      if(!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 120) { pulling=false; callback?.(); toast('새로고침'); }
    }, {passive:true});
    window.addEventListener('touchend', ()=> pulling=false, {passive:true});
  }

  return { toast, openSheet, closeSheet, loading, setActiveNav, vibrate, enablePullToRefresh, logout };
})();
