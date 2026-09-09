// Nova Home pública (08/09/2026) — redesign completo.
//
// GSAP/ScrollTrigger REMOVIDOS — decisão técnica tomada durante a
// implementação, não pedida no mockup. O hero cinematográfico antigo
// (pinado, timeline de scroll) era a única razão real pra GSAP existir
// aqui; com ele fora, a única coisa que sobrava era um reveal-on-scroll
// decorativo (fade-in genérico por seção), que nunca precisou de GSAP
// pra começo de conversa. Achado concreto durante QA: aplicar
// `gsap.from(..., {scrollTrigger:{start:"top 85%"}})` num elemento que
// já nasce DENTRO do viewport (o hero, sempre acima da dobra) deixava
// esse elemento preso em opacity:0 pra sempre — a mesma classe de bug
// "tela em branco ao rolar" que este arquivo já registrava como
// incidente conhecido antes desta rodada (ver histórico do repo).
// Trocado por IntersectionObserver nativo — zero cálculo de posição de
// scroll, zero dependência de script externo, sem essa classe de bug
// por construção. `/vendor/gsap/*` e os dois `<Script>` correspondentes
// em page.tsx foram removidos junto (nunca deixados órfãos).
//
// PRESERVADO — pupilas seguindo o cursor (funcionalidade aprovada,
// nunca perdida no redesign): mesmo algoritmo já usado em
// pro-mascot.tsx (Professional Dashboard) — clamp de distância (nunca
// sai do olho), easing suave, vagar sozinho quando ocioso, respeita
// prefers-reduced-motion (sem tracking nenhum nesse caso). Portado pra
// vanilla JS aqui (home.html não é React) e generalizado pra funcionar
// em QUALQUER número de mascotes/marcas de olho na página (nav,
// footer, hero, "sempre com você", CTA final) — cada um com seu
// próprio centro de referência, nunca um clone de um "olho mestre"
// como antes.
function initMascotEyes() {
  if (window.__homeMarketingMouseHandler) {
    window.removeEventListener('mousemove', window.__homeMarketingMouseHandler);
    window.__homeMarketingMouseHandler = null;
  }
  if (window.__homeMarketingIdleTimer) {
    clearTimeout(window.__homeMarketingIdleTimer);
    window.__homeMarketingIdleTimer = null;
  }

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  var mascots = Array.prototype.slice.call(document.querySelectorAll('#home-marketing .mascot, #home-marketing .nav-logo, #home-marketing .foot-logo'));
  var pupils = [];
  mascots.forEach(function (root) {
    pupils = pupils.concat(Array.prototype.slice.call(root.querySelectorAll('.mascot-pupil')));
  });
  if (pupils.length === 0) return;

  function setPupilOffset(pupil, ox, oy, durationMs) {
    pupil.style.transition = 'transform ' + durationMs + 'ms ease-out';
    pupil.style.transform = 'translate(' + ox + 'px, ' + oy + 'px)';
  }

  // Um único relógio de ociosidade GLOBAL (não por mascote) — mesma
  // coordenação já usada na Home antiga (resetIdle/trackTo): mouse
  // parado reagenda o wander, mouse se movendo sempre cancela e
  // sobrescreve o wander em andamento. Nunca os dois brigando pelo
  // mesmo pupil.style.transform ao mesmo tempo (causa de jitter).
  function startIdleWander() {
    pupils.forEach(function (pupil) {
      var eye = pupil.parentElement;
      var eyeSize = (eye && eye.getBoundingClientRect().width) || 20;
      var max = eyeSize * 0.16; // sutil — nunca "googly eyes"
      var ox = (Math.random() * 2 - 1) * max;
      var oy = (Math.random() * 2 - 1) * max * 0.7;
      setPupilOffset(pupil, ox, oy, 900);
    });
    window.__homeMarketingIdleTimer = setTimeout(startIdleWander, 1400 + Math.random() * 1600);
  }
  function resetIdle() {
    clearTimeout(window.__homeMarketingIdleTimer);
    window.__homeMarketingIdleTimer = setTimeout(startIdleWander, 2200);
  }

  function trackTo(x, y) {
    pupils.forEach(function (pupil) {
      var eye = pupil.parentElement;
      if (!eye) return;
      var rect = eye.getBoundingClientRect();
      var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      var dx = x - cx, dy = y - cy;
      var dist = Math.min(1, Math.hypot(dx, dy) / 500);
      var angle = Math.atan2(dy, dx);
      var max = rect.width * 0.16;
      setPupilOffset(pupil, Math.cos(angle) * max * dist, Math.sin(angle) * max * dist, 140);
    });
  }

  window.__homeMarketingMouseHandler = function (e) { resetIdle(); trackTo(e.clientX, e.clientY); };
  window.addEventListener('mousemove', window.__homeMarketingMouseHandler);
  // Sem mouse (touch/no pointer fino): começa a vagar sozinho depois de
  // um tempo, sem tentar simular cursor nenhum — mesma microanimação
  // passiva sutil de sempre, nunca interação artificial por toque.
  resetIdle();
}

// Olhos grandes da Home anterior, reaproveitados na seção "sempre com
// você" (09/09/2026) — recuperados de
// `git show ad897c0:src/app/_home/home.js` (função `makeEyesMotion`,
// instância `mandaEyes`), a última versão antes do GSAP ter sido
// removido do projeto (08/09/2026, decisão técnica documentada no topo
// deste arquivo — bug real de ScrollTrigger, não capricho). Portado pra
// Web Animations API vanilla: MESMA sequência, MESMAS durações, MESMOS
// valores-alvo do timeline original (jumpTo/hopSelfInPlace/look/blink,
// entrance() com pulos convergindo pro descanso, settledLoop() com
// pausa de 0.7s entre repetições, hover reinicia a entrada). A única
// aproximação real é a curva de easing: WAAPI não tem os eases
// nomeados do GSAP (power1/power2/elastic), então usa equivalentes
// cubic-bezier — impossível reproduzir bit a bit sem a biblioteca em
// si, mas a coreografia (o que importa visualmente) é idêntica.
function initLegacyEyesMotion() {
  var stage = document.getElementById('legacyEyesStage');
  if (!stage) return;

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return; // fica na posição de repouso do CSS, sem nenhum timer/animação

  var colA = document.getElementById('legacyEyesColA');
  var colB = document.getElementById('legacyEyesColB');
  var eyeA = document.getElementById('legacyEyeA');
  var eyeB = document.getElementById('legacyEyeB');
  var pupilA = document.getElementById('legacyPupilA');
  var pupilB = document.getElementById('legacyPupilB');
  var shadowA = colA.querySelector('.legacy-eyes-shadow');
  var shadowB = colB.querySelector('.legacy-eyes-shadow');
  if (!colA || !colB || !eyeA || !eyeB || !pupilA || !pupilB) return;

  var EASE = {
    outQuad: 'cubic-bezier(.25,1,.5,1)',
    inQuad: 'cubic-bezier(.5,0,.75,0)',
    inOut: 'ease-in-out',
    out: 'ease-out',
    in: 'ease-in',
    spring: 'cubic-bezier(.34,1.56,.64,1)' // aproximação de elastic.out(1,.55) — WAAPI não tem eases elásticos nativos
  };

  var eyeSize = eyeA.getBoundingClientRect().width || 160;
  var MAX = eyeSize * 0.24; // alcance do olhar — mesmo fator do original (eyeSize*0.24)
  function jumpSpan() {
    var base = stage.clientWidth * 0.5;
    return Math.min(base, eyeSize * 1.375);
  }

  // estado por elemento — WAAPI não acumula como o GSAP, cada tween
  // precisa saber de onde partiu.
  var state = new WeakMap();
  function getState(el, init) {
    var s = state.get(el);
    if (!s) { s = Object.assign({}, init); state.set(el, s); }
    return s;
  }
  function run(el, keyframes, duration, easing) {
    if (duration <= 0) return Promise.resolve();
    var anim = el.animate(keyframes, { duration: duration * 1000, easing: easing, fill: 'forwards' });
    return anim.finished.catch(function () {});
  }

  function tweenCol(col, x, duration, ease1, ease2) {
    // x sobe (arco até -30px) enquanto desloca lateralmente até `x` —
    // mesma composição do original (Y com ease de subida/descida
    // própria, X contínuo por cima), aproximada num único keyframe.
    var s = getState(col, { x: 0 });
    var x0 = s.x;
    s.x = x;
    return run(col, [
      { transform: 'translate(' + x0 + 'px,0px)', offset: 0 },
      { transform: 'translate(' + (x0 + (x - x0) * 0.55) + 'px,-30px)', offset: 0.53, easing: ease1 || EASE.outQuad },
      { transform: 'translate(' + x + 'px,0px)', offset: 1, easing: ease2 || EASE.inQuad }
    ], duration, 'linear');
  }
  function tweenEyeSquash(eye, sequence, totalDuration) {
    // sequence: [[scaleX,scaleY,offset,easing], ...] começando de 1,1
    var kf = [{ transform: 'scale(1,1)', offset: 0 }];
    sequence.forEach(function (step) {
      kf.push({ transform: 'scale(' + step[0] + ',' + step[1] + ')', offset: step[2], easing: step[3] });
    });
    return run(eye, kf, totalDuration, 'linear');
  }
  function tweenShadow(shadow, sequence, totalDuration) {
    if (!shadow) return Promise.resolve();
    var kf = [{ transform: 'translateX(-50%) scale(1)', opacity: 0.25, offset: 0 }];
    sequence.forEach(function (step) {
      kf.push({ transform: 'translateX(-50%) scale(' + step[0] + ')', opacity: step[1], offset: step[2], easing: step[3] });
    });
    return run(shadow, kf, totalDuration, 'linear');
  }
  function look(pupil, x, y, duration, easing) {
    x = Math.max(-MAX, Math.min(MAX, x));
    y = Math.max(-MAX, Math.min(MAX, y));
    var s = getState(pupil, { x: 0, y: 0 });
    var from = 'translate(' + s.x + 'px,' + s.y + 'px)';
    s.x = x; s.y = y;
    var to = 'translate(' + x + 'px,' + y + 'px)';
    return run(pupil, [{ transform: from }, { transform: to }], duration || 0.4, easing || EASE.outQuad);
  }
  function blink(eye, duration) {
    duration = duration || 0.09;
    return run(eye, [
      { transform: 'scale(1,1)', offset: 0 },
      { transform: 'scale(1,.1)', offset: 0.5, easing: EASE.in },
      { transform: 'scale(1,1)', offset: 1, easing: EASE.in }
    ], duration * 2, 'linear');
  }

  // pulo completo: antecipação (agacha) -> sobe+desloca -> desce -> pouso com pequeno overshoot elástico
  function jumpTo(col, eye, shadow, x, duration) {
    duration = duration || 0.34;
    var anticip = duration * 0.14;
    var rise = duration * 0.36;
    var fall = duration * 0.32;
    var land = duration * 0.18;

    return Promise.all([
      tweenEyeSquash(eye, [[1.1, .86, 1, EASE.out]], anticip),
      tweenShadow(shadow, [[.9, .12, 1, EASE.out]], anticip)
    ]).then(function () {
      return Promise.all([
        tweenCol(col, x, rise + fall, EASE.outQuad, EASE.inQuad),
        tweenEyeSquash(eye, [
          [1.16, .9, rise / (rise + fall), EASE.out],
          [1, 1, 1, EASE.in]
        ], rise + fall),
        tweenShadow(shadow, [
          [.55, .12, rise / (rise + fall), EASE.out],
          [1, .25, 1, EASE.in]
        ], rise + fall)
      ]);
    }).then(function () {
      return tweenEyeSquash(eye, [
        [1.14, .84, .35, EASE.out],
        [1, 1, 1, EASE.spring]
      ], land);
    });
  }
  function hopSelfInPlace(col, eye, shadow, duration) {
    return jumpTo(col, eye, shadow, getState(col, { x: 0 }).x, duration || 0.42);
  }

  var activeToken = 0;

  function entrance() {
    var myToken = ++activeToken;
    var span = jumpSpan();
    var jumpsL = [-span, span * 0.4, 0];
    var jumpsR = [span, -span * 0.4, 0];
    var p = Promise.all([
      jumpTo(colA, eyeA, shadowA, jumpsL[0], 0.6),
      jumpTo(colB, eyeB, shadowB, jumpsR[0], 0.6)
    ])
      .then(function () { if (myToken !== activeToken) return; return Promise.all([jumpTo(colA, eyeA, shadowA, jumpsL[1], 0.6), jumpTo(colB, eyeB, shadowB, jumpsR[1], 0.6)]); })
      .then(function () { if (myToken !== activeToken) return; return Promise.all([jumpTo(colA, eyeA, shadowA, jumpsL[2], 0.6), jumpTo(colB, eyeB, shadowB, jumpsR[2], 0.6)]); })
      .then(function () { if (myToken === activeToken) settledLoop(myToken); });
    return p;
  }

  function wait(seconds) {
    return new Promise(function (resolve) { setTimeout(resolve, seconds * 1000); });
  }

  function settledLoop(myToken) {
    Promise.resolve()
      .then(function () { return Promise.all([look(pupilA, MAX * -0.632, MAX * 0.342), look(pupilB, MAX * 0.632, MAX * -0.395)]); })
      .then(function () { return wait(0.8); })
      .then(function () { return Promise.all([look(pupilA, MAX * 0.737, 0, 0.3), hopSelfInPlace(colA, eyeA, shadowA)]); })
      .then(function () { return wait(0.15); })
      .then(function () { return Promise.all([look(pupilB, MAX * -0.737, 0, 0.3), hopSelfInPlace(colB, eyeB, shadowB)]); })
      .then(function () { return wait(0.2); })
      .then(function () { return hopSelfInPlace(colA, eyeA, shadowA); })
      .then(function () { return wait(0.1); })
      .then(function () { return hopSelfInPlace(colB, eyeB, shadowB); })
      .then(function () { return wait(0.1); })
      .then(function () { return Promise.all([hopSelfInPlace(colA, eyeA, shadowA), hopSelfInPlace(colB, eyeB, shadowB)]); })
      .then(function () { return Promise.all([hopSelfInPlace(colA, eyeA, shadowA), hopSelfInPlace(colB, eyeB, shadowB)]); })
      .then(function () { return Promise.all([look(pupilA, MAX * 0.842, 0, 0.35), look(pupilB, MAX * -0.842, 0, 0.35)]); })
      .then(function () { return wait(0.55); })
      .then(function () { return Promise.all([blink(eyeA), blink(eyeB)]); })
      .then(function () { return wait(1.2); })
      .then(function () {
        if (myToken !== activeToken) return;
        return wait(0.7).then(function () { if (myToken === activeToken) settledLoop(myToken); });
      });
  }

  // hover: reinicia a entrada na hora, do mesmo jeito que o carregamento
  // inicial, mesmo que o loop esteja no meio de uma pausa.
  stage.addEventListener('mouseenter', function () {
    activeToken++; // invalida qualquer cadeia de promises em andamento
    entrance();
  });

  entrance();
}

// Piscada dos mascotes (09/09/2026, redesign a partir do
// doopla-home-mockup.html) — grade de animação explícita: "o logo olha,
// os mascotes piscam". Alvo é só `.mascot .eyes-row .mascot-eye`: os
// dois mascotes novos (hero + CTA final) têm essa estrutura; os olhos
// grandes reaproveitados da Home anterior na seção "sempre com você"
// (.mascot-eyes-only) NUNCA usam .eyes-row, então ficam de fora por
// construção — preservam só o tracking existente, nunca ganham blink.
// Cada mascote tem seu próprio relógio (setTimeout independente, delay
// inicial e intervalo sorteados) de propósito — nunca sincronizados.
// scaleY no próprio .mascot-eye (nunca na pupila) evita qualquer
// deformação/layout shift: só a "pálpebra" fecha, o olho não muda de
// posição nem de tamanho de caixa.
function initMascotBlink() {
  if (window.__homeMarketingBlinkTimers) {
    window.__homeMarketingBlinkTimers.forEach(function (t) { clearTimeout(t); });
  }
  window.__homeMarketingBlinkTimers = [];

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  var roots = Array.prototype.slice
    .call(document.querySelectorAll('#home-marketing .mascot .eyes-row'))
    .map(function (row) { return row.parentElement; })
    .filter(Boolean);

  roots.forEach(function (root) {
    var eyes = Array.prototype.slice.call(root.querySelectorAll('.mascot-eye'));
    if (eyes.length === 0) return;

    function blinkOnce() {
      eyes.forEach(function (eye) { eye.classList.add('blink'); });
      setTimeout(function () {
        eyes.forEach(function (eye) { eye.classList.remove('blink'); });
      }, 110);
    }
    function scheduleNext() {
      var delay = 2400 + Math.random() * 3600; // 2.4s–6s, irregular de propósito
      var t = setTimeout(function () {
        blinkOnce();
        scheduleNext();
      }, delay);
      window.__homeMarketingBlinkTimers.push(t);
    }
    // desfasa o primeiro blink de cada mascote pra nunca nascerem em
    // sincronia (mesmo objetivo do delay inicial aleatório)
    var t0 = setTimeout(function () {
      blinkOnce();
      scheduleNext();
    }, 900 + Math.random() * 3000);
    window.__homeMarketingBlinkTimers.push(t0);
  });
}

// Reveal genérico de cada seção (exceto o hero — sempre visível de
// imediato, mesmo precedente do código antigo: conteúdo acima da
// dobra nunca depende de JS pra aparecer) ao entrar na viewport — puro
// IntersectionObserver, sem GSAP/cálculo de posição de scroll.
//
// Visível por padrão via CSS (nenhuma seção nasce com opacity:0 no
// stylesheet) — só ganha `.reveal-pending` (opacity:0 + leve
// deslocamento) se, e somente se, IntersectionObserver existir E o
// observer já estiver registrado pra ela na MESMA iteração síncrona
// (nunca hidden sem garantia de quem vai revelar depois). Se JS nunca
// rodar, se IntersectionObserver não existir, ou se algo quebrar no
// meio do loop, toda seção ainda não processada fica no padrão visível
// do CSS — nunca invisível pra sempre.
function initSectionReveal() {
  if (window.__homeMarketingRevealObserver) {
    window.__homeMarketingRevealObserver.disconnect();
    window.__homeMarketingRevealObserver = null;
  }
  if (typeof IntersectionObserver === 'undefined') return;

  var sections = Array.prototype.slice.call(document.querySelectorAll('#home-marketing section'));
  var toReveal = sections.filter(function (s) { return !s.classList.contains('hero'); });
  if (toReveal.length === 0) return;

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.remove('reveal-pending');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  toReveal.forEach(function (s) {
    s.classList.add('reveal-pending');
    observer.observe(s);
  });
  window.__homeMarketingRevealObserver = observer;
}

window.__bootHomeMarketing = function boot() {
  initMascotEyes();
  initMascotBlink();
  initLegacyEyesMotion();
  initSectionReveal();
};
