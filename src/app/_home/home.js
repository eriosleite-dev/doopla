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

/* ===== olhos grandes do hero: agora usam o mesmo motion de "pulo" da
   seção "Tem booking pra resolver?" (ver makeEyesMotion abaixo), não
   mais cursor-tracking — por isso pupilL/pupilR não entram no array
   `pupils` de rastreio de mouse. Só os clones pequenos (wordmark, nav,
   footer) continuam seguindo o cursor. ===== */
const pupilL = document.getElementById('pupilL'), pupilR = document.getElementById('pupilR');
const eyeL = document.getElementById('eyeL'), eyeR = document.getElementById('eyeR');
const pupils = [];

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
// eyeL/eyeR (os olhos grandes do hero) não entram aqui: a piscada deles já
// faz parte da coreografia do motion de pulo reaproveitado (ver makeEyesMotion).

function cloneEyeInto(slotId, sourceEye){
  const slot = document.getElementById(slotId);
  const clone = sourceEye.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelector('.pupil').removeAttribute('id');
  slot.appendChild(clone);
  return { eye: clone, pupil: clone.querySelector('.pupil') };
}
const wmL = cloneEyeInto('slotL', eyeL);
const wmR = cloneEyeInto('slotR', eyeR);
pupils.push(wmL.pupil, wmR.pupil); setupPupilFollow(wmL.pupil); setupPupilFollow(wmR.pupil);

const navL = cloneEyeInto('navSlotL', eyeL);
const navR = cloneEyeInto('navSlotR', eyeR);
pupils.push(navL.pupil, navR.pupil); setupPupilFollow(navL.pupil); setupPupilFollow(navR.pupil);
startBlinking([navL.eye, navR.eye]);

const footL = cloneEyeInto('footSlotL', eyeL);
const footR = cloneEyeInto('footSlotR', eyeR);
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

/* ===== motion de "pulo" dos olhos: implementado uma vez, reaproveitado tanto
   pelos olhos grandes do hero quanto pela seção "Tem booking pra resolver?"
   — mesma coreografia (squash-and-stretch, sombra, olhar, blink), só o
   alcance dos movimentos muda, calculado a partir do tamanho real de cada
   par de olhos (não hardcoded), pra escalar certo em cada instância. ===== */
function makeEyesMotion({ colL, colR, eyeL, eyeR, pupilL, pupilR, shadowL, shadowR, spanEl, hoverEl }){
  const eyeSize = eyeL.getBoundingClientRect().width || 160;
  const MAX = eyeSize * 0.24; // alcance do olhar, proporcional ao tamanho do olho
  function jumpSpan(){
    const base = spanEl ? spanEl.clientWidth * 0.5 : eyeSize * 2.75;
    return Math.min(base, eyeSize * 1.375);
  }

  function look(el,x,y,dur=0.4,ease="power3.out"){
    x = Math.max(-MAX, Math.min(MAX, x)); y = Math.max(-MAX, Math.min(MAX, y));
    return gsap.to(el,{x,y,duration:dur,ease});
  }
  function blink(eye,dur=0.09){ return gsap.to(eye,{scaleY:0.1,duration:dur,ease:"power1.in",yoyo:true,repeat:1,transformOrigin:"center"}); }

  // pulo que sempre mira uma posição X ABSOLUTA (nunca soma relativo, então nunca dá deriva/sobreposição ao longo dos loops)
  function jumpTo(col, eye, shadow, x, duration=0.34){
    const tl = gsap.timeline();
    const anticip = duration*0.14;   // pequena antecipação antes de sair do chão
    const rise = duration*0.36;      // subida (desacelera, tipo gravidade)
    const fall = duration*0.32;      // queda (acelera)
    const land = duration*0.18;      // impacto + assentamento

    tl.to(eye,{scaleY:0.86,scaleX:1.1,duration:anticip,ease:"power1.out"},0)
      .to(shadow,{scale:0.9,duration:anticip,ease:"power1.out"},0);
    tl.to(col,{x,duration:rise+fall,ease:"power1.inOut"},anticip);
    tl.to(col,{y:-30,duration:rise,ease:"power2.out"},anticip)
      .to(eye,{scaleY:1.16,scaleX:0.9,duration:rise,ease:"power2.out"},anticip)
      .to(shadow,{scale:0.55,opacity:0.12,duration:rise,ease:"power1.out"},anticip);
    tl.to(col,{y:0,duration:fall,ease:"power2.in"},anticip+rise)
      .to(eye,{scaleY:1,scaleX:1,duration:fall,ease:"power1.in"},anticip+rise)
      .to(shadow,{scale:1,opacity:0.25,duration:fall,ease:"power1.in"},anticip+rise);
    tl.to(eye,{scaleY:0.84,scaleX:1.14,duration:land*0.35,ease:"power1.out"},anticip+rise+fall)
      .to(eye,{scaleY:1,scaleX:1,duration:land*0.9,ease:"elastic.out(1,0.55)"},anticip+rise+fall+land*0.3);
    return tl;
  }
  // pulinho no lugar (nunca move x, só sobe/desce com squash-and-stretch)
  function hopInPlace(col, eye, shadow, duration=0.42){ return jumpTo(col, eye, shadow, 0, duration); }

  let activeTl = null;
  let pendingCall = null;

  // ENTRADA: pulam um em direção ao outro até convergir na posição final de
  // descanso, depois entra no loop assentado.
  function entrance(){
    const span = jumpSpan();
    const jumpsL = [-span, span*0.4, 0];
    const jumpsR = [span, -span*0.4, 0];
    const tl = gsap.timeline({ onComplete: settledLoop });
    jumpsL.forEach((x,i)=> tl.add(jumpTo(colL,eyeL,shadowL,x,0.6), i*0.5));
    jumpsR.forEach((x,i)=> tl.add(jumpTo(colR,eyeR,shadowR,x,0.6), i*0.5+0.16));
    activeTl = tl;
  }

  // ESTADO ASSENTADO (loop contínuo, com pausa entre repetições): ficam no
  // distanciamento fixo, se olham, pulinhos no mesmo lugar.
  function settledLoop(){
    const tl = gsap.timeline({ onComplete:()=>{ pendingCall = gsap.delayedCall(0.7, settledLoop); } });
    tl.add(look(pupilL,MAX*-0.632,MAX*0.342)).add(look(pupilR,MAX*0.632,MAX*-0.395),"<");
    tl.to({},{duration:0.8});
    tl.add(look(pupilL,MAX*0.737,0,0.3)); tl.add(hopInPlace(colL,eyeL,shadowL),"-=0.05");
    tl.to({},{duration:0.15});
    tl.add(look(pupilR,MAX*-0.737,0,0.3)); tl.add(hopInPlace(colR,eyeR,shadowR),"-=0.05");
    tl.to({},{duration:0.2});
    tl.add(hopInPlace(colL,eyeL,shadowL)); tl.to({},{duration:0.1}); tl.add(hopInPlace(colR,eyeR,shadowR)); tl.to({},{duration:0.1});
    tl.add(hopInPlace(colL,eyeL,shadowL)).add(hopInPlace(colR,eyeR,shadowR),"<");
    tl.add(hopInPlace(colL,eyeL,shadowL)).add(hopInPlace(colR,eyeR,shadowR),"<");
    tl.add(look(pupilL,MAX*0.842,0,0.35)).add(look(pupilR,MAX*-0.842,0,0.35),"<");
    tl.to({},{duration:0.55});
    tl.add(blink(eyeL)).add(blink(eyeR),"<");
    tl.to({},{duration:1.2});
    activeTl = tl;
  }

  // hover: dispara o pulo de novo na hora, do mesmo jeito que a entrada,
  // mesmo que o loop automático esteja no meio da pausa entre repetições.
  function retrigger(){
    if(pendingCall){ pendingCall.kill(); pendingCall = null; }
    if(activeTl){ activeTl.kill(); activeTl = null; }
    gsap.set([pupilL,pupilR], { x:0, y:0 });
    entrance();
  }
  if(hoverEl) hoverEl.addEventListener('mouseenter', retrigger);

  return { entrance };
}

/* olhos grandes do hero: entram em cena assim que a página carrega (não
   dependem de scroll, já que são visíveis na primeira tela). */
const heroEyes = makeEyesMotion({
  colL: document.getElementById('heroColL'), colR: document.getElementById('heroColR'),
  eyeL, eyeR, pupilL, pupilR,
  shadowL: document.getElementById('heroShL'), shadowR: document.getElementById('heroShR'),
  spanEl: document.getElementById('logoMark'), hoverEl: document.getElementById('logoMark')
});
heroEyes.entrance();

/* seção "Tem booking pra resolver?": entra só quando a seção aparece na tela */
(function initMandaEyes(){
  const colA=document.getElementById('colA'), colB=document.getElementById('colB');
  const stage=document.getElementById('eyesStage');
  if(!colA || !stage) return; // seção não presente nesta página

  const mandaEyes = makeEyesMotion({
    colL: colA, colR: colB,
    eyeL: document.getElementById('eyeA'), eyeR: document.getElementById('eyeB'),
    pupilL: document.getElementById('pA'), pupilR: document.getElementById('pB'),
    shadowL: document.getElementById('shA'), shadowR: document.getElementById('shB'),
    spanEl: stage, hoverEl: stage
  });
  ScrollTrigger.create({ trigger:"#home-marketing .manda", start:"top 70%", once:true, onEnter: mandaEyes.entrance });
})();
})();
