const { db, query, get, run } = require('../database');
const pipeline = require('../pipeline/runner');
const validator = require('validator');

// ==================== VALIDATION HELPERS ====================

function validateJobId(jobId) {
  if (!jobId || !validator.isInt(jobId, { min: 1 })) {
    throw new Error('Invalid job ID');
  }
}

// ==================== PIPELINE CONTROLLERS ====================

// Run the next step in the pipeline for a job
exports.runNextStep = async (req, res) => {
  try {
    const { id } = req.params;

    try {
      validateJobId(id);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const result = await pipeline.runNextStep(id);
    res.json(result);
  } catch (error) {
    console.error('Run next step error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Run a specific step for a job (for testing or manual override)
exports.runStep = async (req, res) => {
  try {
    const { id, step } = req.params;

    try {
      validateJobId(id);
      if (!step || typeof step !== 'string') {
        throw new Error('Invalid step parameter');
      }
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const result = await pipeline.runStep(id, step);
    res.json(result);
  } catch (error) {
    console.error('Run step error:', error);
    res.status(500).json({ error: error.message });
  }
};
