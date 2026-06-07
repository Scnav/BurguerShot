// Service for generating structured data (schema.org)
const { query, get } = require('../database');
const { safeJsonParse } = require('../utils/parser');

// Generate schema for a job
exports.generateSchema = async (jobId) => {
  try {
    // Get job details
    const job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    // Get the article (in a real app, we'd get it from the articles table)
    // For now, we'll simulate having an article
    const article = {
      title: `Revisão: ${job.main_product || 'Produto'}`,
      description: `Análise completa do ${job.main_product || 'produto'} para ${job.target_audience || 'consumidores'}`,
      mainProduct: job.main_product || ''
    };
    
    // Get products for this job
    const products = await getProductsByJobId(jobId);
    
    // Generate Product schema for the main product
    const mainProduct = products.find(p => p.is_main) || products[0] || {};
    
    // Generate AggregateRating schema if we have rating data
    let aggregateRating = null;
    if (mainProduct.rating !== null && mainProduct.rating !== undefined) {
      aggregateRating = {
        "@type": "AggregateRating",
        "ratingValue": mainProduct.rating,
        "reviewCount": mainProduct.review_count || 0
      };
    }
    
    // Generate the main Product schema
    const productSchema = {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": mainProduct.name || '',
      "image": mainProduct.image || "", // We don't have image field, but adding for completeness
      "description": article.description,
      "sku": mainProduct.sku || "", // We don't have SKU field
      "brand": {
        "@type": "Brand",
        "name": mainProduct.brand || ''
      },
      "offers": {
        "@type": "Offer",
        "url": mainProduct.url || "", // We don't have URL field
        "priceCurrency": "BRL",
        "price": mainProduct.price || 0,
        "priceValidUntil": new Date().toISOString().split('T')[0], // Today's date
        "itemCondition": "https://schema.org/NewCondition",
        "availability": "https://schema.org/InStock"
      },
      "aggregateRating": aggregateRating
    };
    
    // Generate Review schema
    const reviewSchema = {
      "@context": "https://schema.org/",
      "@type": "Review",
      "itemReviewed": productSchema,
      "author": {
        "@type": "Person",
        "name": "Equipe do Blog" // We don't have author info, using placeholder
      },
      "reviewBody": article.description,
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": mainProduct.rating || 0,
        "bestRating": 5,
        "worstRating": 0
      }
    };
    
    // Combine schemas
    const combinedSchema = {
      "@context": "https://schema.org/",
      "@type": "WebPage",
      "name": article.title,
      "description": article.description,
      "mainEntity": productSchema,
      "review": reviewSchema
    };
    
    // In a real implementation, we would save this to the articles table
    // For now, we'll just return it
    return { 
      jobId, 
      schema: combinedSchema,
      productSchema,
      reviewSchema,
      message: 'Schema generated successfully' 
    };
  } catch (error) {
    throw new Error(`Error generating schema: ${error.message}`);
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