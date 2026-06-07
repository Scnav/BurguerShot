const assistantService = require('../services/assistant.service');

exports.generateStepContent = async (req, res) => {
  try {
    const { step, prompt, briefing, previousResults } = req.body;

    if (!step || !prompt) {
      return res.status(400).json({ error: 'step and prompt are required' });
    }

    const result = await assistantService.generateStepContent({
      step,
      prompt,
      briefing: briefing || {},
      previousResults: previousResults || {}
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
