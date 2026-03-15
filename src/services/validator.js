'use strict';

const path = require('path');
const fs = require('fs');
const Ajv = require('ajv');

let _validator = null;

function getValidator() {
  if (_validator) return _validator;
  const schemaPath = path.join(__dirname, '../../data/output_schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  _validator = ajv.compile(schema);
  return _validator;
}

/**
 * Validate an object against the output schema.
 * @param {object} obj
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateSchema(obj) {
  const validate = getValidator();
  const valid = validate(obj);
  if (valid) return { valid: true, errors: [] };

  const errors = (validate.errors || []).map(err => {
    return `${err.instancePath || '(root)'} ${err.message}${err.params ? ' (' + JSON.stringify(err.params) + ')' : ''}`;
  });
  return { valid: false, errors };
}

/**
 * Quality gate checks beyond schema validation.
 * Returns warnings (non-blocking).
 * @param {object} obj
 * @returns {{ passed: boolean, warnings: string[] }}
 */
function qualityCheck(obj) {
  const warnings = [];

  // Title length check
  if (obj.cover_title) {
    const isZh = obj.detected_language === 'zh';
    const maxLen = isZh ? 20 : 60;
    if (obj.cover_title.length > maxLen) {
      warnings.push(`cover_title exceeds recommended max length (${obj.cover_title.length} > ${maxLen})`);
    }
  }

  // Image prompt quality
  if (obj.image_prompt && obj.image_prompt.split(' ').length < 40) {
    warnings.push(`image_prompt may be too short (${obj.image_prompt.split(' ').length} words, recommend 80+)`);
  }

  // Check for forbidden text in image prompt
  const textPatterns = /\b(text|typography|title|headline|caption|word|letter|font|label)\b/i;
  if (obj.image_prompt && textPatterns.test(obj.image_prompt)) {
    warnings.push('image_prompt may contain typography-related terms — ensure no text will appear in generated image');
  }

  // Tag count
  if (obj.topic_tags && obj.topic_tags.length === 0) {
    warnings.push('topic_tags is empty');
  }

  // Color scheme consistency
  if (obj.detected_language === 'en' && obj.color_scheme !== 'dark') {
    warnings.push('English article should use dark color_scheme');
  }
  if (obj.detected_language === 'zh' && obj.color_scheme !== 'light') {
    warnings.push('Chinese article should use light color_scheme');
  }

  return {
    passed: warnings.length === 0,
    warnings
  };
}

module.exports = { validateSchema, qualityCheck };
