// Validation guards for each pipeline step
const { isValidStep } = require('./steps');

// Guard functions for each step
const guards = {
  // Guard for draft_pauta -> dados_brutos
  draft_pauta: (job) => {
    // Check if we have the basic job information
    return job.title && job.category && job.keyword;
  },

  // Guard for dados_brutos -> dados_normalizados
  dados_brutos: (job) => {
    // In a real implementation, we would check if raw data was collected
    // For now, we'll assume if we have a job, we can proceed to normalization
    return true;
  },

  // Guard for dados_normalizados -> similares_definidos
  dados_normalizados: (job) => {
    // Check if we have normalized data (products with specs, etc.)
    // This would typically check the products table for this job
    // For now, we'll return true as a placeholder
    return true;
  },

  // Guard for similares_definidos -> analise_concluida
  similares_definidos: (job) => {
    // Check if we have at least 3 similar products
    // This would query the products table for this job
    // For now, placeholder
    return true;
  },

  // Guard for analise_concluida -> ranking_concluido
  analise_concluida: (job) => {
    // Check if analysis was completed
    // Placeholder
    return true;
  },

  // Guard for ranking_concluido -> estrutura_concluida
  ranking_concluido: (job) => {
    // Check if ranking was generated
    // Placeholder
    return true;
  },

  // Guard for estrutura_concluida -> artigo_gerado
  estrutura_concluida: (job) => {
    // Check if structure was defined
    // Placeholder
    return true;
  },

  // Guard for artigo_gerado -> artigo_revisado
  artigo_gerado: (job) => {
    // Check if article was generated with minimum size
    // Placeholder
    return true;
  },

  // Guard for artigo_revisado -> qa_aprovado
  artigo_revisado: (job) => {
    // Check if article was reviewed
    // Placeholder
    return true;
  },

  // Guard for qa_aprovado -> schema_gerado
  qa_aprovado: (job) => {
    // Check if QA passed (score above threshold)
    // Placeholder
    return true;
  },

  // Guard for schema_gerado -> publicado
  schema_gerado: (job) => {
    // Check if schema was generated
    // Placeholder
    return true;
  }
};

// Function to check if a step can proceed
function canProceedToNextStep(job, currentStep) {
  const guard = guards[currentStep];
  if (typeof guard === 'function') {
    return guard(job);
  }
  // If no guard defined, allow progression
  return true;
}

// Function to get validation errors for a step
function getValidationErrors(job, currentStep) {
  const errors = [];
  const guard = guards[currentStep];
  
  if (typeof guard === 'function') {
    try {
      const isValid = guard(job);
      if (!isValid) {
        // In a real implementation, we would return specific errors
        errors.push(`Validation failed for step ${currentStep}`);
      }
    } catch (err) {
      errors.push(`Error validating step ${currentStep}: ${err.message}`);
    }
  }
  
  return errors;
}

module.exports = {
  guards,
  canProceedToNextStep,
  getValidationErrors
};