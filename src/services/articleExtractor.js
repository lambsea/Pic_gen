'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const { ArticleExtractionError, ShortContentError } = require('../middleware/errorHandler');

const SCRAPE_TIMEOUT_MS = parseInt(process.env.SCRAPE_TIMEOUT_MS || '8000');
const MAX_ARTICLE_LENGTH_CHARS = parseInt(process.env.MAX_ARTICLE_LENGTH_CHARS || '15000');
const MIN_CONTENT_LENGTH = 200;

const USER_AGENT = 'Mozilla/5.0 (compatible; TwitterCoverBot/1.0; +https://github.com/your-org/pic-twitter-cover-generator)';

/**
 * Extract article text from a URL.
 * @param {string} url
 * @returns {Promise<{ text: string, pageTitle: string }>}
 * @throws {ArticleExtractionError} on network/HTTP errors
 * @throws {ShortContentError} if extracted text is too short
 */
async function extract(url) {
  let response;
  try {
    response = await axios.get(url, {
      timeout: SCRAPE_TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7'
      },
      maxRedirects: 5
    });
  } catch (err) {
    logger.warn('Article fetch failed', { url, reason: err.message });
    throw new ArticleExtractionError(`Failed to fetch URL: ${err.message}`);
  }

  const $ = cheerio.load(response.data);

  // Extract page title
  const pageTitle = $('title').text().trim() ||
    $('h1').first().text().trim() ||
    'Untitled';

  // Remove noise elements
  $('script, style, nav, footer, header, aside, .ad, .ads, .advertisement, [class*="sidebar"], [class*="cookie"], [class*="popup"], [class*="modal"], [class*="newsletter"], noscript, iframe').remove();

  // Try content selectors in priority order
  const contentSelectors = [
    'article',
    'main',
    '[role="main"]',
    '.article-body',
    '.article-content',
    '.post-body',
    '.post-content',
    '.entry-content',
    '.content-body',
    '#article-content',
    '#main-content',
    '.story-body',
    '.article__body'
  ];

  let text = '';
  for (const selector of contentSelectors) {
    const el = $(selector);
    if (el.length > 0) {
      const candidate = el.first().text().trim().replace(/\s+/g, ' ');
      if (candidate.length >= MIN_CONTENT_LENGTH) {
        text = candidate;
        break;
      }
    }
  }

  // Fallback to body if no selector matched
  if (text.length < MIN_CONTENT_LENGTH) {
    text = $('body').text().trim().replace(/\s+/g, ' ');
  }

  // Clean up
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  if (text.length < MIN_CONTENT_LENGTH) {
    throw new ShortContentError(`Extracted content too short (${text.length} chars)`);
  }

  // Truncate to max length
  if (text.length > MAX_ARTICLE_LENGTH_CHARS) {
    text = text.substring(0, MAX_ARTICLE_LENGTH_CHARS) + '...';
  }

  logger.info('Article extracted', { url, chars: text.length, pageTitle });

  return { text, pageTitle };
}

module.exports = { extract };
