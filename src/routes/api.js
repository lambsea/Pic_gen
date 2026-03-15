'use strict';

const express = require('express');
const router = express.Router();
const { version } = require('../../package.json');

// GET /api/health
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version
  });
});

module.exports = router;
