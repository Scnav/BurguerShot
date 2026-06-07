const { db, query, get, run } = require('../database');
const validator = require('validator');

// ==================== VALIDATION HELPERS ====================

function validateJobId(jobId) {
  if (!jobId || !validator.isInt(jobId, { min: 1 })) {
    throw new Error('Invalid job ID');
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

function isValidStatus(status) {
  const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'blocked'];
  return validStatuses.includes(status);
}

// ==================== JOB CONTROLLERS ====================

// Create a new job (pauta)
exports.createJob = async (req, res) => {
  try {
    const { title, category, keyword, target_audience, main_product, priority } = req.body;

    if (!title || !category || !keyword) {
      return res.status(400).json({ error: 'Title, category, and keyword are required' });
    }

    const params = [
      sanitizeString(title, 255),
      sanitizeString(category, 100),
      sanitizeString(keyword, 100),
      sanitizeString(target_audience, 255),
      sanitizeString(main_product, 255),
      sanitizeNumber(priority, 0, 10)
    ];

    const result = await run(`
      INSERT INTO jobs (title, category, keyword, target_audience, main_product, priority, status, current_step)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', 'draft_pauta')
    `, params);

    res.status(201).json({ id: result.lastID, message: 'Job created successfully' });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get all jobs (with optional pagination)
exports.getAllJobs = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Validate pagination params
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // max 100 per page

    const rows = await query(
      'SELECT * FROM jobs ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limitNum, offset]
    );

    // Get total count for pagination metadata
    const countRow = await get('SELECT COUNT(*) as total FROM jobs');
    const total = countRow.total;

    res.json({
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get all jobs error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get job by ID
exports.getJobById = async (req, res) => {
  try {
    const { id } = req.params;

    try {
      validateJobId(id);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const row = await get('SELECT * FROM jobs WHERE id = ?', [id]);

    if (!row) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(row);
  } catch (error) {
    console.error('Get job by ID error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update job
exports.updateJob = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, keyword, target_audience, main_product, priority, status, current_step } = req.body;

    try {
      validateJobId(id);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    // Validate status if provided
    if (status && !isValidStatus(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const params = [
      sanitizeString(title),
      sanitizeString(category, 100),
      sanitizeString(keyword, 100),
      sanitizeString(target_audience, 255),
      sanitizeString(main_product, 255),
      sanitizeNumber(priority, 0, 10),
      status,
      current_step,
      id
    ];

    const result = await run(`
      UPDATE jobs SET
        title = COALESCE(?, title),
        category = COALESCE(?, category),
        keyword = COALESCE(?, keyword),
        target_audience = COALESCE(?, target_audience),
        main_product = COALESCE(?, main_product),
        priority = COALESCE(?, priority),
        status = COALESCE(?, status),
        current_step = COALESCE(?, current_step),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `, params);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ message: 'Job updated successfully' });
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete job
exports.deleteJob = async (req, res) => {
  try {
    const { id } = req.params;

    try {
      validateJobId(id);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const result = await run('DELETE FROM jobs WHERE id = ?', [id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Run the next step in the pipeline for a job
exports.runNextStep = async (req, res) => {
  try {
    const { id } = req.params;

    try {
      validateJobId(id);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const pipelineController = require('../controllers/pipeline.controller');
    return pipelineController.runNextStep(req, res);
  } catch (error) {
    console.error('Run next step error:', error);
    res.status(500).json({ error: error.message });
  }
};
