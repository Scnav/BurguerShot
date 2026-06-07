const { run, get, query } = require('../database');
const { STEPS, NEXT_STEP, getNextStep, isValidStep } = require('./steps');
const { canProceedToNextStep, getValidationErrors } = require('./guards');
const aiService = require('../services/ai.service');
const promptService = require('../services/prompt.service');
const normalizationService = require('../services/normalization.service');
const similarityService = require('../services/similarity.service');
const scoringService = require('../services/scoring.service');
const schemaService = require('../services/schema.service');
const exportService = require('../services/export.service');

// Record a step execution in the job_steps table
async function recordStepExecution(jobId, stepName, status, inputData = null, outputData = null, promptVersion = null) {
  const sql = `INSERT INTO job_steps (job_id, step_name, status, input_json, output_json, prompt_version, started_at, finished_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  const now = new Date().toISOString();
  const params = [
    jobId,
    stepName,
    status,
    inputData ? JSON.stringify(inputData) : null,
    outputData ? JSON.stringify(outputData) : null,
    promptVersion || null,
    status === 'in_progress' ? now : null,
    status !== 'in_progress' ? now : null
  ];
  const result = await run(sql, params);
  return result.lastID;
}

// Update job status and current step
async function updateJobStatus(jobId, status, currentStep) {
  const sql = `UPDATE jobs SET status = ?, current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  const params = [status, currentStep, jobId];
  const result = await run(sql, params);
  return result.changes;
}

// Get job by ID
function getJobById(jobId) {
  return get('SELECT * FROM jobs WHERE id = ?', [jobId]);
}

// Run the next step in the pipeline for a job
async function runNextStep(jobId) {
  let nextStep;
  let job;
  try {
    // Get the current job
    job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    const currentStep = job.current_step || 'draft_pauta';
    
    // Check if we can proceed to the next step
    if (!canProceedToNextStep(job, currentStep)) {
      const errors = getValidationErrors(job, currentStep);
      throw new Error(`Cannot proceed to next step. Validation errors: ${errors.join(', ')}`);
    }
    
    // Get the next step
    nextStep = getNextStep(currentStep);
    if (!nextStep) {
      // If there's no next step, the job is complete
      await updateJobStatus(jobId, 'completed', 'publicado');
      return { done: true, message: 'Job completed successfully' };
    }
    
    // Update job status to indicate we're working on the next step
    await updateJobStatus(jobId, 'processing', nextStep);
    
    // Record the step execution
    await recordStepExecution(jobId, nextStep, 'in_progress', { jobId, currentStep });
    
    // Run the appropriate service based on the step
    let result;
    switch (nextStep) {
      case 'dados_brutos':
        // In a real implementation, this would collect raw data
        // For now, we'll simulate it
        result = { message: 'Raw data collection simulated', data: {} };
        break;
        
      case 'dados_normalizados':
        result = await normalizationService.normalizeJobData(jobId);
        break;
        
      case 'similares_definidos':
        result = await similarityService.findSimilarProducts(jobId);
        break;
        
      case 'analise_concluida':
        result = await aiService.runAnalysis(jobId);
        break;
        
      case 'ranking_concluido':
        result = await scoringService.calculateRanking(jobId);
        break;
        
      case 'estrutura_concluida':
        result = await aiService.generateStructure(jobId);
        break;
        
      case 'artigo_gerado':
        result = await aiService.generateArticle(jobId);
        break;
        
      case 'artigo_revisado':
        result = await aiService.reviewArticle(jobId);
        break;
        
      case 'qa_aprovado':
        result = await aiService.runQA(jobId);
        break;
        
      case 'schema_gerado':
        result = await schemaService.generateSchema(jobId);
        break;
        
      case 'publicado':
        result = await exportService.publishJob(jobId);
        break;
        
      default:
        throw new Error(`Unknown step: ${nextStep}`);
    }
    
    // Record the step execution as completed
    await recordStepExecution(jobId, nextStep, 'completed', { jobId, currentStep }, result);
    
    // Update job status to move to the next step
    await updateJobStatus(jobId, 'processing', NEXT_STEP[nextStep] || nextStep);
    
    return { 
      done: false, 
      currentStep: nextStep,
      nextStep: getNextStep(nextStep),
      message: `Step ${nextStep} completed successfully`,
      data: result
    };
  } catch (error) {
    // If there's an error, record the step as failed
    try {
      await recordStepExecution(jobId, nextStep || 'unknown', 'failed', { jobId }, { error: error.message });
      await updateJobStatus(jobId, 'failed', job.current_step || 'draft_pauta');
    } catch (recordError) {
      console.error('Error recording step failure:', recordError);
    }
    
    throw error;
  }
}

// Run a specific step (for testing or manual override)
async function runStep(jobId, stepName) {
  try {
    // Validate the step
    if (!isValidStep(stepName)) {
      throw new Error(`Invalid step: ${stepName}`);
    }
    
    // Get the current job
    const job = await getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    // Check if we can run this step (based on the previous step)
    const currentStepIndex = STEPS.indexOf(job.current_step || 'draft_pauta');
    const targetStepIndex = STEPS.indexOf(stepName);
    
    if (targetStepIndex <= currentStepIndex) {
      throw new Error(`Cannot run step ${stepName}. Current step is ${job.current_step}. Steps must be run in order.`);
    }
    
    // We can only run the immediate next step for now
    const nextStep = getNextStep(job.current_step || 'draft_pauta');
    if (nextStep !== stepName) {
      throw new Error(`Can only run the next step (${nextStep}), not ${stepName}`);
    }
    
    // Run the next step (which should be the requested step)
    return await runNextStep(jobId);
  } catch (error) {
    throw error;
  }
}

module.exports = {
  runNextStep,
  runStep,
  STEPS,
  NEXT_STEP
};