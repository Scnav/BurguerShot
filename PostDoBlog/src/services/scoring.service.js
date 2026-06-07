// Service for calculating scores and rankings
const { query, get } = require('../database');
const { safeJsonParse } = require('../utils/parser');

// Calculate ranking for products in a job
exports.calculateRanking = async (jobId) => {
  try {
    // Get job details
    const job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    // Get products for this job
    const products = await getProductsByJobId(jobId);
    
    // In a real implementation, we would use a sophisticated scoring algorithm
    // For now, we'll use a simple weighted score based on rating and review count
    
    const scoredProducts = products.map(product => {
      // Normalize rating (0-5) to a 0-1 scale
      const ratingScore = product.rating ? product.rating / 5 : 0;
      
      // Normalize review count (logarithmic scale to avoid dominance by products with many reviews)
      const reviewCountScore = product.review_count > 0 ? 
        Math.log10(product.review_count + 1) / Math.log10(100 + 1) : 0; // Assuming 100 reviews is good
      
      // Price factor (lower price is better, but we need to normalize)
      // For simplicity, we'll give a score based on price relative to average
      // In a real implementation, we'd want to consider the category and target audience
      const priceScore = product.price ? 
        (1 - Math.min(1, product.price / 1000)) : 0.5; // Assuming 1000 is a high price
      
      // Weighted score
      const weightedScore = (ratingScore * 0.5) + (reviewCountScore * 0.3) + (priceScore * 0.2);
      
      return {
        ...product,
        score: parseFloat(weightedScore.toFixed(3)),
        ratingScore: parseFloat(ratingScore.toFixed(3)),
        reviewCountScore: parseFloat(reviewCountScore.toFixed(3)),
        priceScore: parseFloat(priceScore.toFixed(3))
      };
    });
    
    // Sort by score descending
    const rankedProducts = scoredProducts.sort((a, b) => b.score - a.score);
    
    // Assign ranks
    const rankedProductsWithRank = rankedProducts.map((product, index) => ({
      ...product,
      rank: index + 1
    }));
    
    // In a real implementation, we would update the products table with scores and ranks
    // For now, we'll just return the ranked data
    return { 
      jobId, 
      rankedProducts: rankedProductsWithRank,
      message: `Ranked ${rankedProductsWithRank.length} products` 
    };
  } catch (error) {
    throw new Error(`Error calculating ranking: ${error.message}`);
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