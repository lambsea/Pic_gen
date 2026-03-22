'use strict';

require('dotenv').config({ override: true });

const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');

// --- Process-level crash protection ---
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception — keeping server alive', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection — keeping server alive', {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// --- Static Files ---
app.use(express.static(path.join(__dirname, '../public')));
app.use('/outputs', express.static(path.join(__dirname, '../outputs')));

// --- Routes ---
app.use('/api', require('./routes/api'));

// --- Error Handler (must be last) ---
app.use(errorHandler);

// --- Start Server ---
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`, { port: PORT, env: process.env.NODE_ENV || 'development' });
});

module.exports = app;
