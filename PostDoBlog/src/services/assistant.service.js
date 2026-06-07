const OpenAI = require('openai');

function buildSystemPrompt() {
  return [
    'Voce e um redator especialista em reviews e rankings para blog.',
    'Sempre responda em portugues do Brasil.',
    'Mantenha formato adequado para uso no fluxo passo a passo.',
    'Nao invente dados numericos ausentes; quando faltar dado, sinalize de forma objetiva.'
  ].join(' ');
}

function buildUserPrompt({ step, prompt, briefing, previousResults }) {
  const historyText = Object.entries(previousResults || {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([k, v]) => `Etapa ${k}:\n${v || ''}`)
    .join('\n\n');

  return [
    `Etapa atual: ${step}`,
    `Produto principal: ${briefing.productName || 'Nao informado'}`,
    `Foco do review/ranking: ${briefing.focusRequirements || 'Nao informado'}`,
    '',
    'Prompt da etapa:',
    prompt,
    '',
    'Resultados anteriores (contexto):',
    historyText || 'Nenhum resultado anterior.',
    '',
    'Retorne somente o conteudo final da etapa, sem explicacoes extras.'
  ].join('\n');
}

async function generateStepContent(input) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY nao configurada no .env');
  }

  const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const completion = await openaiClient.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.7,
    max_tokens: 1800,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(input) }
    ]
  });

  const content = completion.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('A IA nao retornou conteudo para esta etapa');
  }

  return { content };
}

module.exports = {
  generateStepContent
};
