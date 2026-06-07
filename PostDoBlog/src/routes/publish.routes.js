const express = require('express');
const router = express.Router();
const publishController = require('../controllers/publish.controller');

// Publish routes
router.post('/:id', publishController.publishJob);
router.get('/:id/export/:format', publishController.exportJob);

module.exports = router;