const express = require('express');
const router = express.Router();
const jobsController = require('../controllers/jobs.controller');

// Job routes
router.post('/', jobsController.createJob);
router.get('/', jobsController.getAllJobs);
router.get('/:id', jobsController.getJobById);
router.put('/:id', jobsController.updateJob);
router.delete('/:id', jobsController.deleteJob);
router.post('/:id/next-step', jobsController.runNextStep);

module.exports = router;