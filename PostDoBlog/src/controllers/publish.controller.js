const { db, query, get, run } = require('../database');
const exportService = require('../services/export.service');
const validator = require('validator');

// ==================== VALIDATION HELPERS ====================

function validateJobId(jobId) {
  if (!jobId || !validator.isInt(jobId, { min: 1 })) {
    throw new Error('Invalid job ID');
  }
}

// ==================== PUBLISH CONTROLLERS ====================

// Publish a job (export in all formats)
exports.publishJob = async (req, res) => {
  try {
    const { id } = req.params;

    try {
      validateJobId(id);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const result = await exportService.publishJob(id);
    res.json(result);
  } catch (error) {
    console.error('Publish job error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Export a job in a specific format
exports.exportJob = async (req, res) => {
  try {
    const { id, format } = req.params;

    try {
      validateJobId(id);
      if (!format || typeof format !== 'string') {
        throw new Error('Invalid format parameter');
      }
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const validFormats = ['markdown', 'html', 'json', 'cms'];
    if (!validFormats.includes(format)) {
      return res.status(400).json({ error: `Unsupported format: ${format}` });
    }

    switch (format) {
      case 'markdown':
        const markdownResult = await exportService.exportAsMarkdown(id);
        res.json(markdownResult);
        break;
      case 'html':
        const htmlResult = await exportService.exportAsHtml(id);
        res.json(htmlResult);
        break;
      case 'json':
        const jsonResult = await exportService.exportAsJson(id);
        res.json(jsonResult);
        break;
      case 'cms':
        const cmsResult = await exportService.publishToCms(id);
        res.json(cmsResult);
        break;
    }
  } catch (error) {
    console.error('Export job error:', error);
    res.status(500).json({ error: error.message });
  }
};
