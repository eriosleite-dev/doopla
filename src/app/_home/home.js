(function () {
// ---- Logo eyes: smooth follow (lerp) + blink ----
const pupilState = new Map();
document.querySelectorAll('#home-marketing .eye-pupil').forEach(p=>pupilState.set(p,{x:0,y:0,tx:0,ty:0}));
document.addEventListener('mousemove', (e)=>{
  pupilState.forEach((s,p)=>{
    const eye = p.parentElement.getBoundingClientRect();
    const cx = eye.left + eye.width/2, cy = eye.top + eye.height/2;
    const dx = e.clientX - cx, dy = e.clientY - cy;
    const dist = Math.min(Math.hypot(dx,dy)/9, eye.width*0.34);
    const angle = Math.atan2(dy,dx);
    s.tx = Math.cos(angle)*dist;
    s.ty = Math.sin(angle)*dist;
  });
});
function animatePupils(){
  pupilState.forEach((s,p)=>{
    s.x += (s.tx - s.x) * 0.22;
    s.y += (s.ty - s.y) * 0.22;
    p.style.transform = `translate(${s.x}px, ${s.y}px)`;
  });
  requestAnimationFrame(animatePupils);
}
animatePupils();

function initBlink(root){
  function blink(){
    root.classList.add('blink');
    setTimeout(()=>root.classList.remove('blink'), 130);
    setTimeout(blink, 2600 + Math.random()*4200);
  }
  setTimeout(blink, 1800 + Math.random()*2000);
}
document.querySelectorAll('#home-marketing .logo').forEach(initBlink);

// ---- FAQ (reduzida, resto vai pra central de ajuda) ----
const faqData = [
  ["A doopla é uma agência?","Não. A doopla é uma plataforma de representação que conecta artistas e bookers e fornece a infraestrutura pra essa relação funcionar."],
  ["Preciso contratar um booker pra sempre?","Não. Você pode pedir ajuda pontual, só pra responder um e-mail, cobrar um cliente ou negociar uma proposta específica, sem compromisso de representação de carreira inteira."],
  ["Preciso ser booker profissional pra usar a doopla?","Não. Se você é bem conectado, conhece artistas ou pessoas do meio e quer transformar isso em renda extra, também pode entrar como booker."],
  ["Quem fala com o cliente?","Um booker humano autorizado pelo artista. A doopla ajuda com propostas, contratos, follow-ups, pagamentos e organização."],
  ["Posso ter mais de um booker?","Sim. Você pode trabalhar com pessoas diferentes por território, mercado ou tipo de oportunidade."],
  ["Preciso dar exclusividade?","Não como regra da doopla. Você decide com quem trabalha e sob quais condições."],
  ["Já tenho booker. Posso usar a doopla?","Sim. Você pode convidar seu booker pra doopla — vocês usam a plataforma juntos pra organizar oportunidades, negociações, contratos, agenda e pagamentos."],
  ["Quanto custa para o artista?","15 dias grátis. Depois, R$19,90/mês por 3 meses (Preço Fundador) — sem comissão sobre o cachê. Após esse período, passa a valer o preço vigente do plano."],
  ["Quanto custa para o booker?","O Booker Básico é R$0/mês, sem mensalidade. Sua comissão é negociada diretamente com o artista em cada booking."],
  ["A doopla fica com uma porcentagem do cachê ou da comissão?","Não. O artista paga a mensalidade do plano, sem desconto sobre o cachê. A comissão negociada entre booker e artista é 100% do booker."],
  ["O que é Doopla Verified?","O selo que um booking recebe depois que o cliente confirma, por um link oficial da doopla, as condições que foram combinadas."],
  ["Como funcionam os pagamentos?","Você pode usar o Pagamento Doopla, que mantém os dados oficiais do booking registrados num canal seguro, ou manter o pagamento fora da plataforma — nesse caso a doopla não acompanha nem se responsabiliza pela transação."]
];
const faqList = document.getElementById('faqlist');
if (faqList) {
  faqData.forEach(([q,a])=>{
    const item = document.createElement('div');
    item.className = 'faq-item';
    item.innerHTML = `<button class="faq-q"><span>${q}</span><span class="plus">+</span></button><div class="faq-a"><p>${a}</p></div>`;
    const btn = item.querySelector('.faq-q');
    const body = item.querySelector('.faq-a');
    btn.addEventListener('click', ()=>{
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('#home-marketing .faq-item').forEach(i=>{ i.classList.remove('open'); i.querySelector('.faq-a').style.maxHeight=null; });
      if(!isOpen){ item.classList.add('open'); body.style.maxHeight = body.scrollHeight+'px'; }
    });
    faqList.appendChild(item);
  });
}

// ---- Audience gating: home decide "quem é você" antes de mostrar conteúdo ----
let currentAudience = null;
window.selectAudience = function selectAudience(role){
  currentAudience = role;
  document.querySelectorAll('#home-marketing .gated.shared').forEach(el=>el.classList.add('revealed'));
  document.querySelectorAll('#home-marketing .gated.view-artista, #home-marketing .gated.view-booker, #home-marketing .gated.view-agencia').forEach(el=>el.classList.remove('revealed'));
  document.querySelectorAll('#home-marketing .gated.view-'+role).forEach(el=>el.classList.add('revealed'));
  const sw = document.getElementById('roleSwitch');
  sw.classList.add('show');
  sw.querySelectorAll('button').forEach(b=>b.classList.toggle('active', b.dataset.role===role));
  const firstRevealed = document.querySelector('#home-marketing .gated.revealed');
  if(firstRevealed){ firstRevealed.scrollIntoView({behavior:'smooth', block:'start'}); }
};
// Fallback pra links de nav/rodapé clicados antes de escolher audiência: revela o grupo pedido e vai direto pro id.
window.revealAndGo = function revealAndGo(evt, role, id){
  evt.preventDefault();
  if(role==='shared'){
    document.querySelectorAll('#home-marketing .gated.shared').forEach(el=>el.classList.add('revealed'));
    if(!currentAudience){ document.querySelectorAll('#home-marketing .gated.view-artista').forEach(el=>el.classList.add('revealed')); }
  } else {
    selectAudience(role);
  }
  document.getElementById(id).scrollIntoView({behavior:'smooth', block:'start'});
};
})();
