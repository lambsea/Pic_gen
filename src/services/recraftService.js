'use strict';

const axios = require('axios');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { RecraftAPIError } = require('../middleware/errorHandler');

const RECRAFT_API_URL = 'https://external.api.recraft.ai/v1/images/generations';
const RECRAFT_MODEL = process.env.RECRAFT_MODEL || 'recraftv4';
// Model-aware generation sizes. V3 max landscape is 1820x1024,
// V4 supports preset 1536x768 (2:1). Both get cropped to 5:2.
const IS_V3 = RECRAFT_MODEL.toLowerCase().includes('v3');
const RECRAFT_GEN_WIDTH = IS_V3 ? 1820 : 1536;
const RECRAFT_GEN_HEIGHT = IS_V3 ? 1024 : 768;
const FINAL_RATIO = 5 / 2; // 2.5:1 — target aspect ratio
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

  logger.info('Calling Recraft API', {
    model: RECRAFT_MODEL,
    attempt: retryCount,
    promptLength: imagePrompt.length,
    styleId: effectiveStyleId,
    genSize: `${RECRAFT_GEN_WIDTH}x${RECRAFT_GEN_HEIGHT}`,
    targetRatio: '5:2'
  });

  let remoteUrl;
  try {
    const response = await axios.post(
      RECRAFT_API_URL,
      {
        model: RECRAFT_MODEL,
        prompt: imagePrompt,
        n: 1,
        size: `${RECRAFT_GEN_WIDTH}x${RECRAFT_GEN_HEIGHT}`,
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

  // Download image, crop to 5:2, and save locally
  const filename = `${uuidv4()}.jpg`;
  const outputsDir = ensureOutputsDir();
  const localPath = path.join(outputsDir, filename);

  try {
    const imageResponse = await axios.get(remoteUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    // Crop from 2:1 (1536x768) to 5:2 target ratio
    // Target height = width / FINAL_RATIO = 1536 / 2.5 = 614.4 → 614
    const srcBuffer = Buffer.from(imageResponse.data);
    const meta = await sharp(srcBuffer).metadata();
    const srcW = meta.width;
    const srcH = meta.height;
    const targetH = Math.round(srcW / FINAL_RATIO);

    if (targetH < srcH) {
      // Center-crop vertically to achieve 5:2
      const top = Math.round((srcH - targetH) / 2);
      const cropped = await sharp(srcBuffer)
        .extract({ left: 0, top, width: srcW, height: targetH })
        .jpeg({ quality: 92 })
        .toBuffer();
      fs.writeFileSync(localPath, cropped);
      logger.info('Image cropped to 5:2 and saved', {
        filename,
        original: `${srcW}x${srcH}`,
        cropped: `${srcW}x${targetH}`,
        size: cropped.byteLength
      });
    } else {
      // Already correct or narrower than target — save as-is
      fs.writeFileSync(localPath, srcBuffer);
      logger.info('Image saved locally (no crop needed)', { filename, size: srcBuffer.byteLength });
    }
  } catch (downloadErr) {
    logger.warn('Failed to download/crop image, returning remote URL only', { error: downloadErr.message });
    return { remoteUrl, localFilename: null, localPath: null };
  }

  return { remoteUrl, localFilename: filename, localPath };
}

module.exports = { generateImage };
