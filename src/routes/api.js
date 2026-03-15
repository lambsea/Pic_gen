'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const { version } = require('../../package.json');
const logger = require('../utils/logger');
const { ValidationError, ArticleExtractionError, ShortContentError } = require('../middleware/errorHandler');
const articleExtractor = require('../services/articleExtractor');
const claudeService = require('../services/claudeService');
const recraftService = require('../services/recraftService');

const OUTPUTS_DIR = path.resolve(process.cwd(), process.env.OUTPUTS_DIR || './outputs');

function ensureOutputsDir() {
  if (!fs.existsSync(OUTPUTS_DIR)) {
    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  }
}

// -----------------------------------------------
// GET /api/health
// -----------------------------------------------
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version
  });
});

// -----------------------------------------------
// POST /api/generate
// -----------------------------------------------
router.post('/generate', async (req, res, next) => {
  const { title, url, category, language_override } = req.body || {};
  const jobId = uuidv4();
  req.jobId = jobId; // attach for error handler logging

  logger.info('Generation request received', { jobId, title, url, category, language_override });

  // --- Input Validation ---
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return next(new ValidationError('title is required and must be a non-empty string'));
  }

  const cleanTitle = title.trim();
  let mode = 'title_only';
  let articleText = null;
  let pageTitle = null;

  // --- Article Extraction (optional) ---
  if (url && typeof url === 'string' && url.trim().length > 0) {
    try {
      const extracted = await articleExtractor.extract(url.trim());
      articleText = extracted.text;
      pageTitle = extracted.pageTitle;
      mode = 'full';
      logger.info('Article extracted successfully', { jobId, chars: articleText.length });
    } catch (err) {
      if (err instanceof ArticleExtractionError || err instanceof ShortContentError) {
        logger.warn('Article extraction failed, falling back to title-only mode', {
          jobId,
          url,
          reason: err.message
        });
        mode = 'title_only';
      } else {
        return next(err); // unexpected error — escalate
      }
    }
  }

  // --- Claude: Generate Design JSON ---
  let claudeOutput;
  try {
    claudeOutput = await claudeService.generateDesignJSON({
      title: cleanTitle,
      articleText,
      category: category || null,
      language_override: language_override || null
    });
  } catch (err) {
    return next(err);
  }

  // --- Recraft: Generate Image ---
  let imageResult;
  try {
    imageResult = await recraftService.generateImage(claudeOutput.image_prompt);
  } catch (err) {
    return next(err);
  }

  // --- Determine image URL for response ---
  const imageUrl = imageResult.localFilename
    ? `/outputs/${imageResult.localFilename}`
    : imageResult.remoteUrl;

  // --- Assemble Result ---
  const result = {
    jobId,
    ...claudeOutput,
    imageUrl,
    imageRemoteUrl: imageResult.remoteUrl,
    generatedAt: new Date().toISOString(),
    mode,
    input: {
      title: cleanTitle,
      url: url || null,
      category: category || null,
      language_override: language_override || null
    }
  };

  // --- Persist to disk ---
  ensureOutputsDir();
  const outputPath = path.join(OUTPUTS_DIR, `${jobId}.json`);
  try {
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    logger.info('Result saved to disk', { jobId, path: outputPath });
  } catch (saveErr) {
    logger.warn('Failed to save result to disk', { jobId, error: saveErr.message });
    // Non-fatal — continue
  }

  logger.info('Generation complete', {
    jobId,
    mode,
    detected_language: claudeOutput.detected_language,
    color_scheme: claudeOutput.color_scheme,
    imageUrl
  });

  res.json(result);
});

// -----------------------------------------------
// GET /api/outputs/:id
// -----------------------------------------------
router.get('/outputs/:id', (req, res) => {
  const { id } = req.params;
  // Sanitize id — only allow UUID-like patterns
  if (!/^[a-f0-9-]{36}$/.test(id)) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid output ID format' } });
  }

  const outputPath = path.join(OUTPUTS_DIR, `${id}.json`);
  if (!fs.existsSync(outputPath)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Output not found' } });
  }

  try {
    const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: { code: 'READ_ERROR', message: 'Failed to read output file' } });
  }
});

module.exports = router;
