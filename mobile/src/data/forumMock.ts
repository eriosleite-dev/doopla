// Fórum de Profissionais — dados mockados só pra deixar a navegação
// e os estados (busca sem resultado, lista, conversa) navegáveis.
// Sem avatar/foto de usuário em lugar nenhum, conforme o prompt do
// layout.
export const mockForumChips = ['Todos', 'Precificação', 'Contratos', 'Equipamento', 'Eventos'];

export const mockForumTopics = [
  {
    id: 'precos-casamento',
    title: 'Como vocês precificam casamento fora de SP?',
    meta: 'Precificação · 12 respostas',
    lastActivity: 'Há 20 min',
    hasNew: true,
  },
  {
    id: 'contrato-cancelamento',
    title: 'Cláusula de cancelamento com menos de 30 dias',
    meta: 'Contratos · 5 respostas',
    lastActivity: 'Há 3h',
    hasNew: false,
  },
  {
    id: 'equipamento-corporativo',
    title: 'Checklist de equipamento pra evento corporativo grande',
    meta: 'Equipamento · 8 respostas',
    lastActivity: 'Ontem',
    hasNew: false,
  },
];

export const mockForumMessages: Record<string, { author: string; time: string; text: string }[]> = {
  'precos-casamento': [
    { author: 'Renata M.', time: '09:14', text: 'Eu costumo adicionar taxa de deslocamento acima de 80km.' },
    { author: 'João P.', time: '09:20', text: 'Depende muito do horário também, ajusto pra eventos que passam da meia-noite.' },
  ],
  'contrato-cancelamento': [
    { author: 'Carla S.', time: 'ontem', text: 'Uso 50% de multa se cancelar com menos de 30 dias, tem funcionado bem.' },
  ],
  'equipamento-corporativo': [
    { author: 'Bruno T.', time: 'seg', text: 'Sempre levo backup de fonte e cabo, corporativo costuma exigir mais redundância.' },
  ],
};
