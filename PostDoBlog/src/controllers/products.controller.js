const { db, query, get, run } = require('../database');
const { safeJsonParse } = require('../utils/parser');
const validator = require('validator');

// ==================== VALIDATION HELPERS ====================

function validateJobId(jobId) {
  if (!jobId || !validator.isInt(jobId, { min: 1 })) {
    throw new Error('Invalid job ID');
  }
}

function validateProductId(id) {
  if (!id || !validator.isInt(id, { min: 1 })) {
    throw new Error('Invalid product ID');
  }
}

function sanitizeString(value, maxLength = 255) {
  if (typeof value !== 'string') return value;
  return value.trim().substring(0, maxLength);
}

function sanitizeNumber(value, min = null, max = null) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (isNaN(num)) return null;
  if (min !== null && num < min) return min;
  if (max !== null && num > max) return max;
  return num;
}

// ==================== PRODUCT CONTROLLERS ====================

// Create a new product
exports.createProduct = async (req, res) => {
  try {
    const { job_id, name, brand, price, rating, review_count, warranty, specs, pros, cons, is_main } = req.body;

    if (!job_id || !name) {
      return res.status(400).json({ error: 'Job ID and product name are required' });
    }

    // Validate inputs
    try {
      validateJobId(job_id);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const params = [
      job_id,
      sanitizeString(name, 255),
      sanitizeString(brand, 100),
      sanitizeNumber(price, 0),
      sanitizeNumber(rating, 0, 5),
      sanitizeNumber(review_count, 0),
      sanitizeNumber(warranty, 0),
      JSON.stringify(specs || {}),
      JSON.stringify(pros || []),
      JSON.stringify(cons || []),
      is_main ? 1 : 0
    ];

    const result = await run(`
      INSERT INTO products (job_id, name, brand, price, rating, review_count, warranty, specs_json, pros_json, cons_json, is_main)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, params);

    res.status(201).json({ id: result.lastID, message: 'Product created successfully' });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get all products (with optional pagination)
exports.getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Validate pagination params
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const rows = await query(
      'SELECT * FROM products ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limitNum, offset]
    );

    // Parse JSON fields safely
    const parsedRows = rows.map(row => ({
      ...row,
      specs_json: safeJsonParse(row.specs_json, {}),
      pros_json: safeJsonParse(row.pros_json, []),
      cons_json: safeJsonParse(row.cons_json, [])
    }));

    // Get total count
    const countRow = await get('SELECT COUNT(*) as total FROM products');
    const total = countRow.total;

    res.json({
      data: parsedRows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get all products error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get product by ID
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    try {
      validateProductId(id);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const row = await get('SELECT * FROM products WHERE id = ?', [id]);

    if (!row) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Parse JSON fields safely
    const parsedRow = {
      ...row,
      specs_json: safeJsonParse(row.specs_json, {}),
      pros_json: safeJsonParse(row.pros_json, []),
      cons_json: safeJsonParse(row.cons_json, [])
    };

    res.json(parsedRow);
  } catch (error) {
    console.error('Get product by ID error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, brand, price, rating, review_count, warranty, specs, pros, cons, is_main } = req.body;

    try {
      validateProductId(id);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const params = [
      sanitizeString(name),
      sanitizeString(brand, 100),
      sanitizeNumber(price, 0),
      sanitizeNumber(rating, 0, 5),
      sanitizeNumber(review_count, 0),
      sanitizeNumber(warranty, 0),
      specs ? JSON.stringify(specs) : null,
      pros ? JSON.stringify(pros) : null,
      cons ? JSON.stringify(cons) : null,
      is_main ? 1 : 0,
      id
    ];

    const result = await run(`
      UPDATE products SET
        name = COALESCE(?, name),
        brand = COALESCE(?, brand),
        price = COALESCE(?, price),
        rating = COALESCE(?, rating),
        review_count = COALESCE(?, review_count),
        warranty = COALESCE(?, warranty),
        specs_json = COALESCE(?, specs_json),
        pros_json = COALESCE(?, pros_json),
        cons_json = COALESCE(?, cons_json),
        is_main = COALESCE(?, is_main)
        WHERE id = ?
    `, params);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product updated successfully' });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete product
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    try {
      validateProductId(id);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const result = await run('DELETE FROM products WHERE id = ?', [id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get products by job ID
exports.getProductsByJobId = async (req, res) => {
  try {
    const { job_id } = req.params;

    try {
      validateJobId(job_id);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const rows = await query('SELECT * FROM products WHERE job_id = ?', [job_id]);

    // Parse JSON fields safely
    const parsedRows = rows.map(row => ({
      ...row,
      specs_json: safeJsonParse(row.specs_json, {}),
      pros_json: safeJsonParse(row.pros_json, []),
      cons_json: safeJsonParse(row.cons_json, [])
    }));

    res.json(parsedRows);
  } catch (error) {
    console.error('Get products by job ID error:', error);
    res.status(500).json({ error: error.message });
  }
};
