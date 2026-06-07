const express = require('express');
const router = express.Router();
const assistantController = require('../controllers/assistant.controller');

router.post('/generate-step', assistantController.generateStepContent);

module.exports = router;
