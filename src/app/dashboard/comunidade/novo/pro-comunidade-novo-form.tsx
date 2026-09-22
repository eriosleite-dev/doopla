'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState, useTransition, type KeyboardEvent } from 'react';

import { proInputClass, proLabelClass, proPrimaryButtonClass } from '../../pro-format';
import { ProCard } from '../../pro-ui';
import { createTopicAction } from '../actions';
import { useComunidadeDraftGuard } from '../navigation-guard';

const MAX_TAGS = 5;

function normalizeTagForCompare(tag: string): string {
  return tag.trim().toLowerCase();
}

// Tags livres (16/09/2026, QA real) — decisão canônica reverte a
// "vocabulário controlado" de 0059 (ver DECISOES.md): a Comunidade não
// tenta prever todo assunto possível. A pessoa digita, Enter vira tag,
// até 5, removível antes de publicar — nunca um catálogo/dropdown de
// sugestões fixas. O texto vai como `tagLabels` (hidden inputs) pro
// createTopicAction, que manda pra create_community_topic (migration
// 0089) fazer find-or-create por slug no servidor — validação de
// verdade (limite, tamanho, dedupe) sempre server-side também, esta
// validação no client é só feedback imediato, nunca a única barreira.
export function ProComunidadeNovoForm() {
  const router = useRouter();
  const [, startNavTransition] = useTransition();
  const [state, formAction, pending] = useActionState(createTopicAction, {});
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);

  // Navegação pro tópico recém-criado (22/09/2026, correção de
  // regressão de UX) — a action devolve `topicId` em vez de fazer
  // `redirect()` ela mesma (ver comentário de `CreateTopicActionState`
  // em actions.ts): só uma navegação de CLIENT ativa a intercepting
  // route que mantém a Comunidade como painel (mesma que já funciona
  // ao abrir um tópico existente). `router.replace` (não `push`)
  // preserva o comportamento de histórico que já existia antes (a
  // entrada de "Criar tópico" é substituída, nunca empilhada — "←" no
  // detalhe cai direto na Home da Comunidade).
  //
  // Achado real de QA (22/09/2026) — primeira versão desta correção
  // (router.replace fora de transição) causava fundo preto atrás do
  // painel: mesma classe de corrida documentada em next.config.ts/
  // commit c4675ad ("children" perdendo o BFCache numa navegação
  // client-side), só que dessa vez pra uma navegação disparada de
  // dentro de um efeito (nunca de um clique real em <Link>, o único
  // caminho testado quando staleTimes.dynamic foi ajustado). Envolver
  // em startTransition (recomendação oficial do Next pra navegação
  // programática fora de um handler de evento — doc:
  // "wrap router.push/replace calls that are not triggered inside an
  // event handler in startTransition") faz o roteador tratar isso como
  // a mesma classe de navegação que um clique real gera, reaproveitando
  // o BFCache de `children` do jeito que staleTimes.dynamic=30 já
  // previa.
  useEffect(() => {
    if (state.topicId) startNavTransition(() => router.replace(`/dashboard/comunidade/${state.topicId}`));
  }, [state.topicId, router]);

  // Proteção de rascunho (07/09/2026) — o layout do slide-over consulta
  // isto antes de deixar Voltar/Fechar/Escape/clique-fora acontecerem.
  useComunidadeDraftGuard(() => title.trim().length > 0 || body.trim().length > 0 || tags.length > 0);

  function addTag() {
    const value = tagInput.trim();
    if (!value) {
      setTagError(null);
      return;
    }
    if (value.length < 2 || value.length > 40) {
      setTagError('A tag precisa ter entre 2 e 40 caracteres.');
      return;
    }
    if (tags.length >= MAX_TAGS) {
      setTagError(`Máximo de ${MAX_TAGS} tags.`);
      return;
    }
    if (tags.some((t) => normalizeTagForCompare(t) === normalizeTagForCompare(value))) {
      setTagInput('');
      setTagError(null);
      return;
    }
    setTags((prev) => [...prev, value]);
    setTagInput('');
    setTagError(null);
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addTag();
  }

  // Bug real de QA (16/09/2026) — Enter dentro do campo Título publicava
  // o tópico sozinho: comportamento NATIVO do HTML (Enter num <input>
  // de uma linha dispara o submit implícito do <form> em volta), não
  // específico das tags — só ficou fácil de bater nele porque o fluxo
  // natural é preencher as tags antes e terminar no Título. O input de
  // tag já tinha seu próprio preventDefault (handleTagKeyDown acima,
  // pra virar chip em vez de submeter), mas o Título nunca tinha
  // nenhum tratamento. Guarda no <form> inteiro: Enter nunca submete
  // por conta própria em nenhum campo, só o clique real em "Publicar
  // tópico" — exceto dentro da Descrição (textarea), onde Enter precisa
  // continuar sendo quebra de linha, comportamento nativo de sempre.
  function handleFormKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter') return;
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
    e.preventDefault();
  }

  return (
    <ProCard>
      <form action={formAction} onKeyDown={handleFormKeyDown} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={proLabelClass}>Título</span>
          <input
            name="title"
            type="text"
            required
            minLength={3}
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={proInputClass}
            placeholder="O que você quer conversar?"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={proLabelClass}>Descrição</span>
          <textarea
            name="body"
            required
            rows={5}
            maxLength={8000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={`${proInputClass} resize-y`}
            placeholder="Conte um pouco mais."
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className={proLabelClass}>Tags (opcional, até {MAX_TAGS})</span>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="font-doopla-mono inline-flex items-center gap-1.5 rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] py-1.5 pl-3 pr-2 text-[10.5px] uppercase tracking-[.04em] text-[var(--pro-tx-70)]"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remover tag ${tag}`}
                    className="flex h-4 w-4 items-center justify-center opacity-60 hover:opacity-100"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Bug real de QA (16/09/2026) — este input nunca deve DESMONTAR
              condicionalmente (como era antes: `{tags.length < MAX_TAGS &&
              <input .../>}`). Ao adicionar a 5ª tag via Enter, o React
              removia o elemento ainda focado no mesmo evento de tecla; o
              navegador então movia o foco pro próximo elemento focável
              (o botão "Publicar tópico"), e o "soltar" da tecla Enter
              acabava ativando esse botão — submetendo o formulário
              sozinho, sem nenhum clique real. Corrigido mantendo o input
              sempre montado (nunca perde foco por conta própria) — o
              limite de 5 já é aplicado por `addTag()` abaixo, que recusa
              com uma mensagem clara em vez de esconder o campo. */}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => {
              setTagInput(e.target.value);
              if (tagError) setTagError(null);
            }}
            onKeyDown={handleTagKeyDown}
            onBlur={addTag}
            maxLength={40}
            className={proInputClass}
            placeholder="Adicione uma tag..."
          />

          {tagError && <p className="text-[12px] text-[#ff8b80]">{tagError}</p>}

          {tags.map((tag) => (
            <input key={tag} type="hidden" name="tagLabels" value={tag} />
          ))}
        </div>

        {state?.error && <p className="text-[12.5px] text-[#ff8b80]">{state.error}</p>}

        <button type="submit" disabled={pending} className={`${proPrimaryButtonClass} self-start`}>
          {pending ? 'Publicando…' : 'Publicar tópico'}
        </button>
      </form>
    </ProCard>
  );
}
