const express = require('express');
const router = express.Router();
const promptsController = require('../controllers/prompts.controller');

// Prompt routes
router.get('/:step', promptsController.getPromptByStep);
router.post('/', promptsController.createPrompt);
router.put('/:step', promptsController.updatePrompt);

module.exports = router;