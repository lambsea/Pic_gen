'use strict';

const logger = require('../utils/logger');

// --- Typed Error Classes ---

class ArticleExtractionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArticleExtractionError';
    this.code = 'ARTICLE_EXTRACTION_FAILED';
    this.statusCode = 200; // caught in route, not sent to errorHandler
  }
}

class ShortContentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ShortContentError';
    this.code = 'SHORT_CONTENT';
    this.statusCode = 200; // caught in route, not sent to errorHandler
  }
}

class ClaudeJSONError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClaudeJSONError';
    this.code = 'CLAUDE_INVALID_JSON';
    this.statusCode = 502;
  }
}

class RecraftAPIError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RecraftAPIError';
    this.code = 'RECRAFT_API_FAILED';
    this.statusCode = 502;
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'INPUT_VALIDATION_FAILED';
    this.statusCode = 400;
  }
}

// --- Express Global Error Handler ---

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  logger.error(err.message, {
    code,
    statusCode,
    jobId: req.jobId || undefined,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  });

  res.status(statusCode).json({
    error: {
      code,
      message: err.message || 'An unexpected error occurred'
    }
  });
}

module.exports = {
  ArticleExtractionError,
  ShortContentError,
  ClaudeJSONError,
  RecraftAPIError,
  ValidationError,
  errorHandler
};
