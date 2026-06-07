// Service for finding similar products
const { query, get, run } = require('../database');
const { safeJsonParse } = require('../utils/parser');

// Find similar products for a job
exports.findSimilarProducts = async (jobId) => {
  try {
    // Get job details
    const job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    // Get products for this job
    const products = await getProductsByJobId(jobId);
    
    // In a real implementation, we would use some similarity algorithm
    // For now, we'll just return the products as "similar" if we have at least 3
    // and mark the main product
    
    // Ensure we have a main product
    let mainProduct = products.find(p => p.is_main);
    if (!mainProduct && products.length > 0) {
      // If no main product is designated, make the first one the main product
      mainProduct = products[0];
      // Update the database to set this as main
      await setMainProduct(jobId, mainProduct.id);
    }
    
    // For demonstration, we'll just return the products
    // In a real app, we would filter/sort based on similarity to the main product
    return { 
      jobId, 
      mainProduct, 
      similarProducts: products.filter(p => p.id !== mainProduct.id),
      allProducts: products,
      message: `Found ${products.length} products, with 1 main product and ${products.length - 1} similar products` 
    };
  } catch (error) {
    throw new Error(`Error finding similar products: ${error.message}`);
  }
};

// Set a product as the main product for a job
async function setMainProduct(jobId, productId) {
  // First, unset any existing main product for this job
  const unsetSql = `UPDATE products SET is_main = 0 WHERE job_id = ?`;
  await run(unsetSql, [jobId]);

  // Then set the specified product as main
  const setSql = `UPDATE products SET is_main = 1 WHERE id = ? AND job_id = ?`;
  const result = await run(setSql, [productId, jobId]);
  return result.changes;
}

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