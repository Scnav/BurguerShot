// Service for exporting content (Markdown, HTML, JSON, CMS)
const fs = require('fs');
const path = require('path');
const marked = require('marked');
const { query, get } = require('../database');
const { safeJsonParse } = require('../utils/parser');

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true
});

// Export job as Markdown
exports.exportAsMarkdown = async (jobId) => {
  try {
    // Get job details
    const job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    // Get the article (in a real app, we'd get it from the articles table)
    // For now, we'll simulate having an article
    const articleContent = `# Revisão: ${job.main_product || 'Produto'}\n\nAnálise completa do ${job.main_product || 'produto'} para ${job.target_audience || 'consumidores'}.\n\n## Pontos Positivos\n- Qualidade excelente\n- Bom custo-benefício\n\n## Pontos Negativos\n- Disponibilidade limitada\n\n## Conclusão\nRecomendado para quem busca qualidade e durabilidade.`;
    
    // Create output directory if it doesn't exist
    const markdownDir = path.join(__dirname, '..', '..', 'output', 'markdown');
    await fs.promises.mkdir(markdownDir, { recursive: true });
    
    // Create filename based on job title and timestamp
    const slug = job.title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const filename = `${slug}-${jobId}.md`;
    const filePath = path.join(markdownDir, filename);
    
    // Write the markdown file
    await fs.promises.writeFile(filePath, articleContent, 'utf8');
    
    // In a real implementation, we would save this to the articles table
    // For now, we'll just return the file path
    return { 
      jobId, 
      format: 'markdown',
      filePath,
      filename,
      message: 'Exported as Markdown successfully' 
    };
  } catch (error) {
    throw new Error(`Error exporting as Markdown: ${error.message}`);
  }
};

// Export job as HTML
exports.exportAsHtml = async (jobId) => {
  try {
    // Get job details
    const job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    // Get the article content (markdown)
    const articleContent = `# Revisão: ${job.main_product || 'Produto'}\n\nAnálise completa do ${job.main_product || 'produto'} para ${job.target_audience || 'consumidores'}.\n\n## Pontos Positivos\n- Qualidade excelente\n- Bom custo-benefício\n\n## Pontos Negativos\n- Disponibilidade limitada\n\n## Conclusão\nRecomendado para quem busca qualidade e durabilidade.`;
    
    // Convert markdown to HTML
    const htmlContent = marked.parse(articleContent);
    
    // Create a full HTML document
    const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Revisão: ${job.main_product || 'Produto'}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; max-width: 800px; }
        h1, h2, h3 { color: #333; }
        ul { padding-left: 20px; }
        li { margin-bottom: 10px; }
        .pros { color: green; }
        .cons { color: red; }
        .conclusion { background: #f0f0f0; padding: 15px; border-radius: 5px; margin-top: 20px; }
    </style>
</head>
<body>
    ${htmlContent}
</body>
</html>`;
    
    // Create output directory if it doesn't exist
    const htmlDir = path.join(__dirname, '..', '..', 'output', 'html');
    await fs.promises.mkdir(htmlDir, { recursive: true });
    
    // Create filename based on job title and timestamp
    const slug = job.title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const filename = `${slug}-${jobId}.html`;
    const filePath = path.join(htmlDir, filename);
    
    // Write the HTML file
    await fs.promises.writeFile(filePath, fullHtml, 'utf8');
    
    // In a real implementation, we would save this to the articles table
    // For now, we'll just return the file path
    return { 
      jobId, 
      format: 'html',
      filePath,
      filename,
      message: 'Exported as HTML successfully' 
    };
  } catch (error) {
    throw new Error(`Error exporting as HTML: ${error.message}`);
  }
};

// Export job as JSON
exports.exportAsJson = async (jobId) => {
  try {
    // Get job details
    const job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    // Get products for this job
    const products = await getProductsByJobId(jobId);
    
    // Create JSON object
    const jsonData = {
      job: {
        id: job.id,
        title: job.title,
        category: job.category,
        keyword: job.keyword,
        target_audience: job.target_audience,
        main_product: job.main_product,
        priority: job.priority,
        status: job.status,
        current_step: job.current_step,
        created_at: job.created_at,
        updated_at: job.updated_at
      },
      products: products.map(product => ({
        id: product.id,
        name: product.name,
        brand: product.brand,
        price: product.price,
        rating: product.rating,
        review_count: product.review_count,
        warranty: product.warranty,
        specs: safeJsonParse(product.specs_json, {}),
        pros: safeJsonParse(product.pros_json, []),
        cons: safeJsonParse(product.cons_json, []),
        is_main: product.is_main
      })),
      exported_at: new Date().toISOString()
    };
    
    // Create output directory if it doesn't exist
    const jsonDir = path.join(__dirname, '..', '..', 'output', 'json');
    await fs.promises.mkdir(jsonDir, { recursive: true });
    
    // Create filename based on job title and timestamp
    const slug = job.title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const filename = `${slug}-${jobId}.json`;
    const filePath = path.join(jsonDir, filename);
    
    // Write the JSON file
    await fs.promises.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
    
    // In a real implementation, we would save this to the articles table
    // For now, we'll just return the file path
    return { 
      jobId, 
      format: 'json',
      filePath,
      filename,
      message: 'Exported as JSON successfully' 
    };
  } catch (error) {
    throw new Error(`Error exporting as JSON: ${error.message}`);
  }
};

// Publish to CMS (simulated)
exports.publishToCms = async (jobId) => {
  try {
    // Get job details
    const job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    // In a real implementation, this would make an API call to a CMS
    // For now, we'll simulate the publication
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Return success
    return { 
      jobId, 
      format: 'cms',
      url: `https://example.com/blog/${job.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      message: 'Published to CMS successfully (simulated)' 
    };
  } catch (error) {
    throw new Error(`Error publishing to CMS: ${error.message}`);
  }
};

// Main publish function that exports in all formats
exports.publishJob = async (jobId) => {
  try {
    // Export in all formats
    const markdownResult = await this.exportAsMarkdown(jobId);
    const htmlResult = await this.exportAsHtml(jobId);
    const jsonResult = await this.exportAsJson(jobId);
    const cmsResult = await this.publishToCms(jobId);
    
    // In a real implementation, we would update the articles table with publish status
    // For now, we'll just return all results
    return { 
      jobId, 
      exports: [markdownResult, htmlResult, jsonResult, cmsResult],
      message: 'Job published successfully in all formats' 
    };
  } catch (error) {
    throw new Error(`Error publishing job: ${error.message}`);
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