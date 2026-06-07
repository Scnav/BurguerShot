const fs = require('fs');
const path = require('path');

// Directory where prompt files are stored
const PROMPTS_DIR = path.join(__dirname, '..', '..', 'prompts');

// Cache for prompt templates to avoid reading files repeatedly
const promptCache = new Map();

/**
 * Load a prompt template from file
 * @param {string} step - The step name (e.g., 'analise_concluida')
 * @returns {Promise<string>} - The prompt template
 */
async function getPromptByStep(step) {
  // Check cache first
  if (promptCache.has(step)) {
    return promptCache.get(step);
  }

  // Construct file path: we expect files like 01-editorial.txt, 02-normalizacao.txt, etc.
  // But we don't have a direct mapping from step to file number. Let's assume we have a mapping.
  // For simplicity, we'll use the step name to look for a file named `${step}.txt`
  // However, the example in the task uses numbered files. We'll create a mapping object.

  // Mapping from step to filename (without extension)
  const stepToFileMap = {
    'draft_pauta': '01-editorial',
    'dados_brutos': '02-normalizacao',
    'dados_normalizados': '03-similares',
    'similares_definidos': '04-analise',
    'analise_concluida': '05-ranking',
    'ranking_concluido': '06-estrutura',
    'estrutura_concluida': '07-artigo',
    'artigo_gerado': '08-revisao',
    'artigo_revisado': '09-qa',
    'qa_aprovado': '10-schema',
    'schema_gerado': '10-schema', // Actually, schema_gerado might be the same as qa_aprovado? Let's adjust.
    'publicado': null // No prompt for published step
  };

  // For steps that don't have a direct mapping, we'll try to use the step name
  let fileName = stepToFileMap[step];
  if (!fileName) {
    // Fallback: use the step name
    fileName = step;
  }

  const filePath = path.join(PROMPTS_DIR, `${fileName}.txt`);

  try {
    const template = await fs.promises.readFile(filePath, 'utf8');
    promptCache.set(step, template);
    return template;
  } catch (error) {
    // If the specific file doesn't exist, try a generic one or throw an error
    console.warn(`Prompt file not found for step ${step} at ${filePath}. Using default.`);
    // We'll return a default prompt
    return `Default prompt for step ${step}. Please create a prompt file for this step.`;
  }
}

/**
 * Render a prompt template by replacing variables
 * @param {string} template - The prompt template string
 * @param {Object} variables - Key-value pairs to replace in the template
 * @returns {string} - The rendered prompt
 */
function renderPrompt(template, variables) {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    const regex = new RegExp(placeholder, 'g');
    rendered = rendered.replace(regex, value);
  }
  return rendered;
}

/**
 * Save a prompt template to file (for versioning)
 * @param {string} step - The step name
 * @param {string} content - The prompt content
 * @param {string} version - Optional version identifier (if not provided, uses timestamp)
 * @returns {Promise<void>}
 */
async function savePrompt(step, content, version = null) {
  if (!version) {
    version = new Date().toISOString().replace(/[:.]/g, '-');
  }
  const fileName = `${step}_v${version}.txt`;
  const filePath = path.join(PROMPTS_DIR, 'versions', fileName);

  // Ensure the versions directory exists
  const versionsDir = path.join(PROMPTS_DIR, 'versions');
  await fs.promises.mkdir(versionsDir, { recursive: true });

  await fs.promises.writeFile(filePath, content, 'utf8');
}

/**
 * Get a list of versions for a step
 * @param {string} step - The step name
 * @returns {Promise<string[]>} - List of version filenames
 */
async function getPromptVersions(step) {
  const versionsDir = path.join(PROMPTS_DIR, 'versions');
  try {
    const files = await fs.promises.readdir(versionsDir);
    return files.filter(file => file.startsWith(`${step}_v`) && file.endsWith('.txt'));
  } catch (error) {
    // If the versions directory doesn't exist, return empty array
    return [];
  }
}

module.exports = {
  getPromptByStep,
  renderPrompt,
  savePrompt,
  getPromptVersions
};