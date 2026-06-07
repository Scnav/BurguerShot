/**
 * Safe JSON parsing utility
 * Returns a default value if parsing fails
 */

/**
 * Safely parse JSON string
 * @param {string|null|undefined} str - The JSON string to parse
 * @param {*} defaultValue - The default value to return if parsing fails
 * @returns {*} Parsed value or default
 */
function safeJsonParse(str, defaultValue = {}) {
  if (!str || typeof str !== 'string') {
    return defaultValue;
  }

  try {
    return JSON.parse(str);
  } catch (err) {
    console.error('JSON parse error:', err.message, 'Input:', str.substring(0, 100));
    return defaultValue;
  }
}

/**
 * Safely stringify JSON, returning default on circular structure
 * @param {*} obj - Object to stringify
 * @param {*} defaultValue - Value to return on error
 * @returns {string} JSON string or default value
 */
function safeJsonStringify(obj, defaultValue = '{}') {
  try {
    return JSON.stringify(obj);
  } catch (err) {
    console.error('JSON stringify error:', err.message);
    return defaultValue;
  }
}

module.exports = {
  safeJsonParse,
  safeJsonStringify
};
