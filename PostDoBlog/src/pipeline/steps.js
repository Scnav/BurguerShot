// Define the pipeline steps and their order
const STEPS = [
  'draft_pauta',
  'dados_brutos',
  'dados_normalizados',
  'similares_definidos',
  'analise_concluida',
  'ranking_concluido',
  'estrutura_concluida',
  'artigo_gerado',
  'artigo_revisado',
  'qa_aprovado',
  'schema_gerado',
  'publicado'
];

// Map each step to the next step
const NEXT_STEP = {};
for (let i = 0; i < STEPS.length - 1; i++) {
  NEXT_STEP[STEPS[i]] = STEPS[i + 1];
}

// Function to get the next step
function getNextStep(currentStep) {
  return NEXT_STEP[currentStep] || null;
}

// Function to get the current step index
function getStepIndex(step) {
  return STEPS.indexOf(step);
}

// Function to check if a step is valid
function isValidStep(step) {
  return STEPS.includes(step);
}

module.exports = {
  STEPS,
  NEXT_STEP,
  getNextStep,
  getStepIndex,
  isValidStep
};