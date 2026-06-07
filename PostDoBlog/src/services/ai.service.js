const openai = require('openai');
const promptService = require('./prompt.service');
const { query, get } = require('../database');
const { safeJsonParse } = require('../utils/parser');

// Configure OpenAI (in a real app, you'd use the API key from environment)
const openaiClient = new openai.OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here'
});

// Run analysis step
exports.runAnalysis = async (jobId) => {
  try {
    // Get job details
    const job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    // Get products for this job
    const products = await getProductsByJobId(jobId);
    
    // Load the analysis prompt
    const promptTemplate = await promptService.getPromptByStep('analise_concluida');
    
    // Prepare variables for the prompt
    const variables = {
      job_title: job.title,
      job_category: job.category,
      job_keyword: job.keyword,
      main_product: job.main_product,
      target_audience: job.target_audience,
      products: JSON.stringify(products, null, 2)
    };
    
    // Render the prompt
    const prompt = promptService.renderPrompt(promptTemplate, variables);
    
    // Call the AI API
    const response = await openaiClient.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Você é um especialista em análise de produtos para blogs de revisão." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });
    
    const analysis = response.choices[0].message.content;
    
    // In a real implementation, we would save this to the database
    // For now, we'll just return it
    return { analysis };
  } catch (error) {
    throw new Error(`Error running analysis: ${error.message}`);
  }
};

// Generate structure step
exports.generateStructure = async (jobId) => {
  try {
    // Get job details
    const job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    // Get products for this job
    const products = await getProductsByJobId(jobId);
    
    // Load the structure prompt
    const promptTemplate = await promptService.getPromptByStep('estrutura_concluida');
    
    // Prepare variables for the prompt
    const variables = {
      job_title: job.title,
      job_category: job.category,
      job_keyword: job.keyword,
      main_product: job.main_product,
      target_audience: job.target_audience,
      products: JSON.stringify(products, null, 2)
    };
    
    // Render the prompt
    const prompt = promptService.renderPrompt(promptTemplate, variables);
    
    // Call the AI API
    const response = await openaiClient.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Você é um especialista em estruturação de artigos para blogs de revisão." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });
    
    const structure = response.choices[0].message.content;
    
    // In a real implementation, we would save this to the database
    // For now, we'll just return it
    return { structure };
  } catch (error) {
    throw new Error(`Error generating structure: ${error.message}`);
  }
};

// Generate article step
exports.generateArticle = async (jobId) => {
  try {
    // Get job details
    const job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    // Get products for this job
    const products = await getProductsByJobId(jobId);
    
    // Load the article prompt
    const promptTemplate = await promptService.getPromptByStep('artigo_gerado');
    
    // Prepare variables for the prompt
    const variables = {
      job_title: job.title,
      job_category: job.category,
      job_keyword: job.keyword,
      main_product: job.main_product,
      target_audience: job.target_audience,
      products: JSON.stringify(products, null, 2)
    };
    
    // Render the prompt
    const prompt = promptService.renderPrompt(promptTemplate, variables);
    
    // Call the AI API
    const response = await openaiClient.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Você é um redator especializado em artigos de revisão de produtos para blogs." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 3000
    });
    
    const article = response.choices[0].message.content;
    
    // In a real implementation, we would save this to the articles table
    // For now, we'll just return it
    return { article };
  } catch (error) {
    throw new Error(`Error generating article: ${error.message}`);
  }
};

// Review article step
exports.reviewArticle = async (jobId) => {
  try {
    // Get job details
    const job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    // Get the article (in a real app, we'd get it from the articles table)
    // For now, we'll simulate having an article
    const article = `# Revisão do Produto\n\nEste é um artigo de revisão simulado para o trabalho ${job.title}.`;
    
    // Load the review prompt
    const promptTemplate = await promptService.getPromptByStep('artigo_revisado');
    
    // Prepare variables for the prompt
    const variables = {
      job_title: job.title,
      job_category: job.category,
      job_keyword: job.keyword,
      article: article
    };
    
    // Render the prompt
    const prompt = promptService.renderPrompt(promptTemplate, variables);
    
    // Call the AI API
    const response = await openaiClient.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Você é um editor especializado em revisão de artigos para blogs de tecnologia." },
        { role: "user", content: prompt }
      ],
      temperature: 0.5,
      max_tokens: 1500
    });
    
    const reviewedArticle = response.choices[0].message.content;
    
    // In a real implementation, we would save this to the articles table
    // For now, we'll just return it
    return { reviewedArticle };
  } catch (error) {
    throw new Error(`Error reviewing article: ${error.message}`);
  }
};

// Run QA step
exports.runQA = async (jobId) => {
  try {
    // Get job details
    const job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    // Get the article (in a real app, we'd get it from the articles table)
    // For now, we'll simulate having an article
    const article = `# Revisão do Produto\n\nEste é um artigo de revisão simulado para o trabalho ${job.title}.`;
    
    // Load the QA prompt
    const promptTemplate = await promptService.getPromptByStep('qa_aprovado');
    
    // Prepare variables for the prompt
    const variables = {
      job_title: job.title,
      job_category: job.category,
      job_keyword: job.keyword,
      article: article
    };
    
    // Render the prompt
    const prompt = promptService.renderPrompt(promptTemplate, variables);
    
    // Call the AI API
    const response = await openaiClient.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Você é um especialista em qualidade de conteúdo para blogs de revisão de produtos." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });
    
    const qaResult = response.choices[0].message.content;
    
    // Parse the QA result to extract a score (in a real implementation)
    // For now, we'll simulate a score
    const qaScore = 8.5; // out of 10
    
    // In a real implementation, we would save this to the articles table
    // For now, we'll just return it
    return { qaResult, qaScore };
  } catch (error) {
    throw new Error(`Error running QA: ${error.message}`);
  }
};

// Helper function to get job by ID
async function getJobById(jobId) {
  try {
    const sql = `SELECT * FROM jobs WHERE id = ?`;
    const row = await get(sql, [jobId]);
    return row;
  } catch (error) {
    throw error;
  }
}

// Helper function to get products by job ID
async function getProductsByJobId(jobId) {
  try {
    const sql = `SELECT * FROM products WHERE job_id = ?`;
    const rows = await query(sql, [jobId]);
    // Parse JSON fields safely
    const parsedRows = rows.map(row => ({
      ...row,
      specs_json: safeJsonParse(row.specs_json, {}),
      pros_json: safeJsonParse(row.pros_json, []),
      cons_json: safeJsonParse(row.cons_json, [])
    }));
    return parsedRows;
  } catch (error) {
    throw error;
  }
}

module.exports = exports;