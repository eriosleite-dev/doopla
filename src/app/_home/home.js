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
  initSectionReveal();
};
