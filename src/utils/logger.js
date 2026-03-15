'use strict';

const LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
const currentLevel = process.env.LOG_LEVEL || 'INFO';

function log(level, message, meta = {}) {
  if (LEVELS[level] <= LEVELS[currentLevel]) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta
    };
    console.log(JSON.stringify(entry));
  }
}

module.exports = {
  info:  (message, meta) => log('INFO',  message, meta),
  warn:  (message, meta) => log('WARN',  message, meta),
  error: (message, meta) => log('ERROR', message, meta),
  debug: (message, meta) => log('DEBUG', message, meta),
};
