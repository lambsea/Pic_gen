'use strict';

const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { RecraftAPIError } = require('../middleware/errorHandler');

const RECRAFT_API_URL = 'https://external.api.recraft.ai/v1/images/generations';
const RECRAFT_MODEL = process.env.RECRAFT_MODEL || 'recraftv4';
const IMAGE_WIDTH = parseInt(process.env.RECRAFT_IMAGE_WIDTH || '1200');
const IMAGE_HEIGHT = parseInt(process.env.RECRAFT_IMAGE_HEIGHT || '675');
const MAX_RETRIES = parseInt(process.env.RECRAFT_MAX_RETRIES || '2');
const RETRY_BASE_DELAY_MS = parseInt(process.env.RECRAFT_RETRY_BASE_DELAY_MS || '1000');
const OUTPUTS_DIR = process.env.OUTPUTS_DIR || './outputs';
const RECRAFT_STYLE_ID = process.env.RECRAFT_STYLE_ID || null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureOutputsDir() {
  const dir = path.resolve(process.cwd(), OUTPUTS_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Generate an image with Recraft V4 and save it locally.
 * @param {string} imagePrompt
 * @param {number} retryCount
 * @param {string|null} styleIdOverride - optional style_id that overrides RECRAFT_STYLE_ID env var
 * @returns {Promise<{ remoteUrl: string, localFilename: string, localPath: string }>}
 * @throws {RecraftAPIError} after max retries
 */
async function generateImage(imagePrompt, retryCount = 0, styleIdOverride = null) {
  const apiKey = process.env.RECRAFT_API_KEY;
  if (!apiKey) {
    throw new RecraftAPIError('RECRAFT_API_KEY environment variable is not set');
  }

  const effectiveStyleId = styleIdOverride || RECRAFT_STYLE_ID;

  logger.info('Calling Recraft API', { model: RECRAFT_MODEL, attempt: retryCount, promptLength: imagePrompt.length, styleId: effectiveStyleId });

  let remoteUrl;
  try {
    const response = await axios.post(
      RECRAFT_API_URL,
      {
        model: RECRAFT_MODEL,
        prompt: imagePrompt,
        n: 1,
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        response_format: 'url',
        ...(effectiveStyleId && { style_id: effectiveStyleId })
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    remoteUrl = response.data?.data?.[0]?.url || response.data?.images?.[0]?.url;
    if (!remoteUrl) {
      throw new Error(`Unexpected response structure: ${JSON.stringify(response.data).substring(0, 200)}`);
    }
  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    logger.warn('Recraft API call failed', { attempt: retryCount, status, error: errMsg });

    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retryCount);
      logger.info(`Retrying Recraft in ${delay}ms`, { nextAttempt: retryCount + 1 });
      await sleep(delay);
      return generateImage(imagePrompt, retryCount + 1, styleIdOverride);
    }

    throw new RecraftAPIError(`Recraft API failed after ${retryCount + 1} attempts: ${errMsg}`);
  }

  // Download image locally
  const filename = `${uuidv4()}.jpg`;
  const outputsDir = ensureOutputsDir();
  const localPath = path.join(outputsDir, filename);

  try {
    const imageResponse = await axios.get(remoteUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    fs.writeFileSync(localPath, imageResponse.data);
    logger.info('Image saved locally', { filename, size: imageResponse.data.byteLength });
  } catch (downloadErr) {
    logger.warn('Failed to download image locally, returning remote URL only', { error: downloadErr.message });
    // Don't throw — return remote URL as fallback
    return { remoteUrl, localFilename: null, localPath: null };
  }

  return { remoteUrl, localFilename: filename, localPath };
}

module.exports = { generateImage };
