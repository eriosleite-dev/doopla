// Fallback independente do boot() abaixo: se /vendor/gsap falhar em
// carregar (rede do usuário, bloqueio, etc.), o boot() nunca sai do loop
// de espera e o hero fica com opacity:0 pra sempre (ver home.css,
// bloco "Fallback sem GSAP"). Isso roda de qualquer jeito, com ou sem
// GSAP, e força o conteúdo visível numa versão estática se o script
// não aparecer a tempo.
(function gsapFallbackWatch() {
  var settled = false;
  function markLoaded() {
    if (settled) return;
    settled = true;
    clearTimeout(fallbackTimer);
    clearInterval(pollTimer);
  }
  var fallbackTimer = setTimeout(function () {
    if (settled) return;
    var root = document.getElementById('home-marketing');
    if (root) root.classList.add('gsap-fallback');
  }, 4000);
  var pollTimer = setInterval(function () {
    if (typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined') {
      markLoaded();
    }
  }, 150);
})();

(function boot() {
// next/script (afterInteractive) não garante, na prática, que os dois
// <script src> do GSAP terminem de carregar antes deste script inline
// rodar, então espera window.gsap/ScrollTrigger existirem antes de seguir.
if (typeof window.gsap === 'undefined' || typeof window.ScrollTrigger === 'undefined') {
  requestAnimationFrame(boot);
  return;
}

gsap.registerPlugin(ScrollTrigger);

/* ===== reveal genérico de cada seção ao entrar na viewport ===== */
gsap.utils.toArray('#home-marketing section').forEach(el=>{
  if(el.classList.contains('stage')) return; // hero tem timeline própria
  gsap.from(el.querySelectorAll(':scope > *, :scope > div > *'), {
    opacity:0, y:22, duration:0.55, stagger:0.05,
    scrollTrigger:{ trigger:el, start:'top 82%' }
  });
});

/* ===== nav: claro sobre seções de fundo claro, escuro sobre fundo escuro ===== */
const nav = document.getElementById('mainNav');
document.querySelectorAll('#home-marketing section[data-navlight]').forEach(sec=>{
  const light = sec.dataset.navlight === '1';
  ScrollTrigger.create({
    trigger:sec, start:'top 90px', end:'bottom 90px',
    onEnter:()=> nav.classList.toggle('on-light', light),
    onEnterBack:()=> nav.classList.toggle('on-light', light)
  });
});

/* ===== olhos grandes: cursor, piscada, vagar sozinho ===== */
const pupils = [document.getElementById('pupilL'), document.getElementById('pupilR')];
const eyeEls = [document.getElementById('eyeL'), document.getElementById('eyeR')];

const pupilXY = new Map();
function setupPupilFollow(p){
  const qx = gsap.quickTo(p, "x", { duration:0.65, ease:"power3.out" });
  const qy = gsap.quickTo(p, "y", { duration:0.65, ease:"power3.out" });
  pupilXY.set(p, {qx, qy});
}
pupils.forEach(setupPupilFollow);

function trackTo(x, y){
  pupils.forEach(p => {
    const rect = p.parentElement.getBoundingClientRect();
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    const dx = x - cx, dy = y - cy;
    const maxDist = rect.width * 0.28;
    const dist = Math.min(Math.hypot(dx,dy)/8, maxDist);
    const angle = Math.atan2(dy,dx);
    const fn = pupilXY.get(p);
    if(fn){ fn.qx(Math.cos(angle)*dist); fn.qy(Math.sin(angle)*dist); }
  });
}
let idleTween=null, idleTimer=null;
function startIdleWander(){
  const angle = { v: Math.random()*Math.PI*2 };
  idleTween = gsap.to(angle, { v:"+="+(Math.PI*2), duration:7, ease:"none", repeat:-1,
    onUpdate:() => {
      pupils.forEach((p,i) => {
        const rect = p.parentElement.getBoundingClientRect();
        const r = rect.width*0.16, off = i*0.4;
        const fn = pupilXY.get(p);
        if(fn){ fn.qx(Math.cos(angle.v+off)*r); fn.qy(Math.sin((angle.v+off)*1.3)*r*0.6); }
      });
    }
  });
}
function resetIdle(){
  if(idleTween){ idleTween.kill(); idleTween=null; }
  clearTimeout(idleTimer);
  idleTimer = setTimeout(startIdleWander, 2800);
}
window.addEventListener('mousemove', (e)=>{ resetIdle(); trackTo(e.clientX, e.clientY); });
resetIdle();

function startBlinking(eyes){
  (function blink(){
    const delay = 2.4 + Math.random()*4.5;
    gsap.delayedCall(delay, () => {
      gsap.to(eyes, { scaleY:0.12, duration:0.09, ease:"power1.in", transformOrigin:"center",
        yoyo:true, repeat:1, onComplete: blink });
    });
  })();
}
startBlinking(eyeEls);

function cloneEyeInto(slotId, sourceEye){
  const slot = document.getElementById(slotId);
  const clone = sourceEye.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelector('.pupil').removeAttribute('id');
  slot.appendChild(clone);
  return { eye: clone, pupil: clone.querySelector('.pupil') };
}
const wmL = cloneEyeInto('slotL', document.getElementById('eyeL'));
const wmR = cloneEyeInto('slotR', document.getElementById('eyeR'));
pupils.push(wmL.pupil, wmR.pupil); setupPupilFollow(wmL.pupil); setupPupilFollow(wmR.pupil);

const navL = cloneEyeInto('navSlotL', document.getElementById('eyeL'));
const navR = cloneEyeInto('navSlotR', document.getElementById('eyeR'));
pupils.push(navL.pupil, navR.pupil); setupPupilFollow(navL.pupil); setupPupilFollow(navR.pupil);
startBlinking([navL.eye, navR.eye]);

const footL = cloneEyeInto('footSlotL', document.getElementById('eyeL'));
const footR = cloneEyeInto('footSlotR', document.getElementById('eyeR'));
pupils.push(footL.pupil, footR.pupil); setupPupilFollow(footL.pupil); setupPupilFollow(footR.pupil);
startBlinking([footL.eye, footR.eye]);

/* ===== timeline do stage: olhos grandes -> encolhem no wordmark -> nav/kicker/hero-copy entram ===== */
const stageTl = gsap.timeline({
  scrollTrigger:{ trigger:"#home-marketing .stage", start:"top top", end:"bottom bottom", scrub:1 }
});
stageTl
  .to("#logoMark", { scale:0.5, duration:1, ease:"none" }, 0)
  .to("#home-marketing .grain", { y:"18%", duration:1, ease:"none" }, 0)
  .to("#scrollHint", { opacity:0, duration:0.15 }, 0)
  .to("#mainNav", { opacity:1, y:0, pointerEvents:"auto", duration:0.4 }, 0.5)
  .to(["#edgeLeft","#edgeRight","#seal","#indexCount"], { opacity:1, duration:0.4 }, 0.5)
  .to("#kicker", { opacity:1, duration:0.3 }, 0.55)
  .to("#logoMark", { opacity:0, duration:0.2 }, 0.65)
  .to("#wordmark", { opacity:1, duration:0.4 }, 0.68)
  .to("#wordmark", { y:-40, duration:0.35 }, 1.15)
  .to("#kicker", { y:-40, opacity:0, duration:0.3 }, 1.15)
  .to("#heroCopy", { opacity:1, y:0, duration:0.5 }, 1.25);
})();
