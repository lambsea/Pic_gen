'use strict';

const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');
const { validateSchema, qualityCheck } = require('./validator');
const { ClaudeJSONError } = require('../middleware/errorHandler');

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const CLAUDE_MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || '2000');
const CLAUDE_MAX_RETRIES = parseInt(process.env.CLAUDE_MAX_RETRIES || '2');

let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// Load and cache data files
let _brandBrief = null;
let _outputSchema = null;
let _mainPrompt = null;
let _repairPrompt = null;

function loadDataFiles() {
  if (!_brandBrief) {
    _brandBrief = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/brand_brief.json'), 'utf8'));
  }
  if (!_outputSchema) {
    _outputSchema = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/output_schema.json'), 'utf8'));
  }
  if (!_mainPrompt) {
    _mainPrompt = fs.readFileSync(path.join(__dirname, '../../data/prompt_templates/main_prompt.txt'), 'utf8');
  }
  if (!_repairPrompt) {
    _repairPrompt = fs.readFileSync(path.join(__dirname, '../../data/prompt_templates/repair_prompt.txt'), 'utf8');
  }
  return { brandBrief: _brandBrief, outputSchema: _outputSchema, mainPrompt: _mainPrompt, repairPrompt: _repairPrompt };
}

/**
 * Strip markdown code fences from a string if present.
 */
function stripCodeFences(text) {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Call Claude API with a messages array and return the text content.
 */
async function callClaude(systemMessage, userMessage) {
  const client = getClient();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    system: systemMessage,
    messages: [{ role: 'user', content: userMessage }]
  });
  return response.content[0].text;
}

/**
 * Generate a structured design JSON for a Twitter cover image.
 *
 * @param {object} params
 * @param {string} params.title - Article title (required)
 * @param {string|null} params.articleText - Article body text (optional)
 * @param {string} [params.category] - Topic category (optional)
 * @param {string} [params.language_override] - 'zh' | 'en' | null (optional)
 * @returns {Promise<object>} Validated design JSON
 * @throws {ClaudeJSONError} after max retries
 */
async function generateDesignJSON({ title, articleText, category, language_override }) {
  const { brandBrief, outputSchema, mainPrompt, repairPrompt } = loadDataFiles();

  const SYSTEM_MESSAGE = `You are a professional visual designer and brand strategist specializing in social media cover image design. You produce precise, structured JSON design specifications. You MUST return ONLY valid JSON — no markdown, no code fences, no explanation, no extra text. Your output must exactly conform to the provided JSON schema.`;

  // Interpolate main prompt
  const articleContent = articleText
    ? articleText.substring(0, 8000)
    : '(No article content available. Base the design on the title only.)';

  const userMessage = mainPrompt
    .replace('{{BRAND_BRIEF_JSON}}', JSON.stringify(brandBrief, null, 2))
    .replace('{{TITLE}}', title)
    .replace('{{CATEGORY}}', category || 'General')
    .replace('{{LANGUAGE_OVERRIDE}}', language_override || 'none')
    .replace('{{ARTICLE_CONTENT}}', articleContent)
    .replace('{{OUTPUT_SCHEMA_JSON}}', JSON.stringify(outputSchema, null, 2));

  let lastRawResponse = '';
  let lastErrors = [];

  for (let attempt = 0; attempt <= CLAUDE_MAX_RETRIES; attempt++) {
    let rawResponse;

    if (attempt === 0) {
      logger.info('Calling Claude for design JSON', { model: CLAUDE_MODEL, attempt });
      rawResponse = await callClaude(SYSTEM_MESSAGE, userMessage);
    } else {
      // Repair attempt
      logger.warn('Claude JSON invalid, attempting repair', { attempt, errors: lastErrors });
      const repairMessage = repairPrompt
        .replace('{{VALIDATION_ERRORS}}', lastErrors.join('\n'))
        .replace('{{PREVIOUS_RESPONSE}}', lastRawResponse);
      rawResponse = await callClaude(SYSTEM_MESSAGE, repairMessage);
    }

    lastRawResponse = rawResponse;
    const cleaned = stripCodeFences(rawResponse);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      lastErrors = [`JSON parse error: ${parseErr.message}`];
      if (attempt >= CLAUDE_MAX_RETRIES) {
        throw new ClaudeJSONError(`Claude returned invalid JSON after ${attempt + 1} attempts: ${parseErr.message}`);
      }
      continue;
    }

    const { valid, errors } = validateSchema(parsed);
    if (!valid) {
      lastErrors = errors;
      if (attempt >= CLAUDE_MAX_RETRIES) {
        throw new ClaudeJSONError(`Claude output failed schema validation after ${attempt + 1} attempts: ${errors.join('; ')}`);
      }
      continue;
    }

    // Apply language override AFTER validation
    if (language_override && ['zh', 'en'].includes(language_override)) {
      parsed.detected_language = language_override;
      parsed.color_scheme = language_override === 'en' ? 'dark' : 'light';
    }

    // Run quality checks (warnings only, non-blocking)
    const { warnings } = qualityCheck(parsed);
    if (warnings.length > 0) {
      logger.warn('Quality check warnings', { warnings });
    }

    logger.info('Claude design JSON generated', {
      detected_language: parsed.detected_language,
      color_scheme: parsed.color_scheme,
      template_variant: parsed.layout_spec?.template_variant
    });

    return parsed;
  }

  throw new ClaudeJSONError(`Claude JSON generation failed after ${CLAUDE_MAX_RETRIES + 1} attempts`);
}

module.exports = { generateDesignJSON };
