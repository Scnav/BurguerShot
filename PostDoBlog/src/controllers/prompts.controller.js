const { db, query, get, run } = require('../database');
const path = require('path');
const fs = require('fs').promises;
const promptsDir = path.join(__dirname, '..', '..', 'prompts');

// Get prompt by step
exports.getPromptByStep = async (req, res) => {
  try {
    const { step } = req.params;
    
    // Whitelist of allowed step names to prevent path traversal
    const allowedSteps = [
      'draft_pauta', 'dados_brutos', 'dados_normalizados', 'similares_definidos',
      'analise_concluida', 'ranking_concluido', 'estrutura_concluida', 'artigo_gerado',
      'artigo_revisado', 'qa_aprovado', 'schema_gerado'
    ];

    if (!allowedSteps.includes(step)) {
      return res.status(400).json({ error: 'Invalid step parameter' });
    }

    // Map step to filename (simplified mapping)
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
      'schema_gerado': '10-schema'
    };

    const fileName = stepToFileMap[step];
    const filePath = path.join(promptsDir, `${fileName}.txt`);

    try {
      const data = await fs.readFile(filePath, 'utf8');
      res.json({ step, prompt: data });
    } catch (err) {
      // If file not found, return a default prompt
      return res.status(404).json({ 
        error: `Prompt file not found for step ${step}`,
        defaultPrompt: `Default prompt for step ${step}. Please create a prompt file for this step.`
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create a new prompt (save to file)
exports.createPrompt = async (req, res) => {
  try {
    const { step, content } = req.body;
    if (!step || !content) {
      return res.status(400).json({ error: 'Step and content are required' });
    }

    // Map step to filename
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
      'schema_gerado': '10-schema'
    };

    const fileName = stepToFileMap[step] || step;
    const filePath = path.join(promptsDir, `${fileName}.txt`);

    await fs.writeFile(filePath, content, 'utf8');
    res.json({ message: `Prompt for step ${step} saved successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update an existing prompt
exports.updatePrompt = async (req, res) => {
  try {
    const { step } = req.params;
    const { content } = req.body;
    
    if (!step || content === undefined) {
      return res.status(400).json({ error: 'Step and content are required' });
    }

    // Validate step
    const allowedSteps = [
      'draft_pauta', 'dados_brutos', 'dados_normalizados', 'similares_definidos',
      'analise_concluida', 'ranking_concluido', 'estrutura_concluida', 'artigo_gerado',
      'artigo_revisado', 'qa_aprovado', 'schema_gerado'
    ];

    if (!allowedSteps.includes(step)) {
      return res.status(400).json({ error: 'Invalid step parameter' });
    }

    // Map step to filename
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
      'schema_gerado': '10-schema'
    };

    const fileName = stepToFileMap[step];
    const filePath = path.join(promptsDir, `${fileName}.txt`);

    await fs.writeFile(filePath, content, 'utf8');
    res.json({ message: `Prompt for step ${step} updated successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
