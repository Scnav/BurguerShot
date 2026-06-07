// Service for normalizing product data
const { query, get } = require('../database');
const { safeJsonParse } = require('../utils/parser');

// Normalize job data (products, specs, etc.)
exports.normalizeJobData = async (jobId) => {
  try {
    // Get job details
    const job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    // Get products for this job
    const products = await getProductsByJobId(jobId);
    
    // Normalize each product
    const normalizedProducts = products.map(product => {
      return {
        ...product,
        // Normalize price to number
        price: product.price ? parseFloat(product.price) : null,
        // Normalize rating to number between 0-5
        rating: product.rating ? Math.min(5, Math.max(0, parseFloat(product.rating))) : null,
        // Ensure review_count is integer
        review_count: product.review_count ? parseInt(product.review_count) : 0,
        // Normalize specs (ensure it's an object)
        specs: typeof product.specs_json === 'string' ? 
               safeJsonParse(product.specs_json, {}) : 
               (product.specs_json || {}),
        // Normalize pros and cons (ensure they're arrays)
        pros: Array.isArray(product.pros_json) ? product.pros_json : 
              (typeof product.pros_json === 'string' ? 
               safeJsonParse(product.pros_json, []) : 
               []),
        cons: Array.isArray(product.cons_json) ? product.cons_json : 
              (typeof product.cons_json === 'string' ? 
               safeJsonParse(product.cons_json, []) : 
               [])
      };
    });
    
    // In a real implementation, we would update the products table with normalized data
    // For now, we'll just return the normalized data
    return { 
      jobId, 
      normalizedProducts, 
      message: `Normalized data for ${normalizedProducts.length} products` 
    };
  } catch (error) {
    throw new Error(`Error normalizing job data: ${error.message}`);
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