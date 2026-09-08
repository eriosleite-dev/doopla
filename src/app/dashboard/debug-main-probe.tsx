'use client';

import { useEffect, useState } from 'react';

// INSTRUMENTAÇÃO TEMPORÁRIA (08/09/2026) — investigação do "fundo
// preto" da Comunidade. Confirmado pelo usuário: fechar por X faz o
// conteúdo reaparecer imediatamente — ou seja, `children` NÃO está
// sendo destruído, algo opaco está sendo pintado POR CIMA dele
// enquanto a Comunidade está aberta. Este componente amostra, a cada
// 400ms, exatamente qual elemento real do DOM está no centro da área
// onde o conteúdo deveria aparecer (`document.elementFromPoint`, a
// única forma de responder "o que está cobrindo este pixel" sem
// suposição) e o estado do próprio <main> (dimensões, nº de filhos,
// display/visibility/opacity computados) — nunca inferido, sempre lido
// direto do DOM renderizado. Remover assim que a causa for confirmada;
// não é permanente, não afeta comportamento, só reporta.
export function DebugMainProbe() {
  const [info, setInfo] = useState('medindo…');

  useEffect(() => {
    function describe(el: Element | null): string {
      if (!el) return 'nenhum';
      const cs = window.getComputedStyle(el);
      const cls = (el.getAttribute('class') || '').slice(0, 60);
      return `<${el.tagName.toLowerCase()} class="${cls}"> bg=${cs.backgroundColor} z=${cs.zIndex} pos=${cs.position} op=${cs.opacity} vis=${cs.visibility} disp=${cs.display}`;
    }

    function measure() {
      const main = document.querySelector('main');
      if (!main) {
        setInfo(`path=${window.location.pathname} | <main> NÃO ENCONTRADO NO DOM`);
        return;
      }
      const rect = main.getBoundingClientRect();
      const mainCs = window.getComputedStyle(main);
      const sampleX = rect.left + Math.min(200, rect.width / 2);
      const sampleY = rect.top + Math.min(150, rect.height / 2);
      const topEl = document.elementFromPoint(sampleX, sampleY);
      const isMainOrDescendant = topEl ? main.contains(topEl) : false;

      setInfo(
        `path=${window.location.pathname}\n` +
          `<main> rect=${Math.round(rect.width)}x${Math.round(rect.height)} filhos=${main.children.length} ` +
          `bg=${mainCs.backgroundColor} op=${mainCs.opacity} vis=${mainCs.visibility} disp=${mainCs.display}\n` +
          `ponto amostrado (${Math.round(sampleX)},${Math.round(sampleY)}) pertence a <main>? ${isMainOrDescendant}\n` +
          `elemento nesse ponto: ${describe(topEl)}`
      );
    }

    measure();
    const id = setInterval(measure, 400);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 8,
        left: 8,
        zIndex: 999999,
        background: '#39ff14',
        color: '#000',
        fontFamily: 'monospace',
        fontSize: 10.5,
        lineHeight: 1.4,
        padding: '6px 9px',
        borderRadius: 6,
        maxWidth: '640px',
        whiteSpace: 'pre-wrap',
        boxShadow: '0 4px 16px rgba(0,0,0,.5)',
      }}
    >
      {'DEBUG (temporário) — '}
      {info}
    </div>
  );
}
