# Twitter Article Cover Generator

A Node.js web app that generates branded Twitter Article cover images. Input an article title or URL, and the system uses Claude Sonnet 4.6 to produce a structured visual design, then Recraft V4 to generate a 1200×675px cover image—with automatic dark/light theme selection based on content language (English → dark, Chinese → light).

## Features

- **Automatic article scraping from URLs** — Extracts content from live web pages with fallback to title-only mode
- **Claude Sonnet 4.6 for visual concept generation** — Structured JSON output with validated schema for consistency
- **Recraft V4 for high-quality image generation** — Photorealistic 1200×675px cover images with cinematic lighting
- **Auto-detect language** — English articles → dark theme, Chinese → light theme
- **Language override option** — Force dark or light theme regardless of detected language
- **Retry and fallback logic** — URL scraping failure gracefully falls back to title-only mode
- **JSON output schema with AJV validation** — Ensures all outputs match brand requirements
- **Clean web UI** — Simple form-based interface, ready to integrate into existing websites

## Tech Stack

- **Node.js + Express** — Fast, lightweight server framework
- **@anthropic-ai/sdk** (Claude Sonnet 4.6) — Structured visual design generation
- **Recraft V4 API** — High-quality AI image generation
- **Cheerio** — Server-side article HTML parsing and scraping
- **AJV** — JSON schema validation
- **Axios** — HTTP client for API calls and URL fetching
- **UUID** — Unique job ID generation
- **Nodemon** (dev) — Hot-reload during development

## Quick Start

### Prerequisites

- Node.js >= 18
- Anthropic API key
- Recraft API key

### Setup

```bash
git clone <repo-url>
cd pic-twitter-cover-generator
npm install
cp .env.example .env
# Edit .env and add your API keys (ANTHROPIC_API_KEY and RECRAFT_API_KEY)
npm run dev
```

Open http://localhost:3000

## Environment Variables

All variables from `.env.example`:

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Your Anthropic API key (required) |
| `RECRAFT_API_KEY` | — | Your Recraft API key (required) |
| `PORT` | 3000 | Server port |
| `NODE_ENV` | development | Node environment |
| `LOG_LEVEL` | INFO | Logging level (DEBUG, INFO, WARN, ERROR) |
| `SCRAPE_TIMEOUT_MS` | 8000 | Article scraping timeout in milliseconds |
| `MAX_ARTICLE_LENGTH_CHARS` | 15000 | Maximum article text to send to Claude |
| `CLAUDE_MODEL` | claude-sonnet-4-6 | Claude model to use |
| `CLAUDE_MAX_TOKENS` | 2000 | Max tokens for Claude response |
| `CLAUDE_MAX_RETRIES` | 2 | Retry attempts for Claude API failures |
| `RECRAFT_MODEL` | recraftv4 | Recraft model to use |
| `RECRAFT_IMAGE_WIDTH` | 1200 | Generated image width in pixels |
| `RECRAFT_IMAGE_HEIGHT` | 675 | Generated image height in pixels |
| `RECRAFT_MAX_RETRIES` | 2 | Retry attempts for Recraft API failures |
| `RECRAFT_RETRY_BASE_DELAY_MS` | 1000 | Base delay between retries (exponential backoff) |
| `OUTPUTS_DIR` | ./outputs | Directory to store generated images |

## API Reference

### POST /api/generate

Generates a cover design and image.

**Request body:**
```json
{
  "title": "string (required — article title or headline)",
  "url": "string (optional — article URL to scrape; if scraping fails, falls back to title-only)",
  "category": "string (optional — article category, e.g., 'tech', 'business', 'health')",
  "language_override": "string (optional — 'en' for dark theme, 'zh' for light theme; overrides auto-detection)"
}
```

**Response (200 OK):**
```json
{
  "jobId": "uuid",
  "cover_title": "string",
  "article_summary": "string",
  "visual_concept": "string",
  "image_prompt": "string",
  "negative_prompt": "string",
  "detected_language": "en | zh",
  "color_scheme": "dark | light",
  "layout_spec": {
    "template_variant": "A | B | C",
    "title_alignment": "center | left",
    "safe_text_area": "string",
    "logo_position": "bottom-right",
    "overlay_opacity": "number (0–1)"
  },
  "brand_checklist": ["item", "item", ...],
  "imageUrl": "/outputs/[filename].jpg",
  "timestamp": "2026-03-15T12:00:00Z"
}
```

**Error responses:**

| Status | Code | Meaning |
|--------|------|---------|
| 400 | INPUT_VALIDATION_FAILED | Missing or invalid `title` field |
| 200 | ARTICLE_EXTRACTION_FAILED | URL scraping failed; fell back to title-only mode (partial success) |
| 200 | SHORT_CONTENT | Extracted content too short; fell back to title-only mode |
| 502 | CLAUDE_INVALID_JSON | Claude failed to produce valid JSON; retried but ultimately failed |
| 502 | RECRAFT_API_FAILED | Recraft API failed after retries |
| 500 | INTERNAL_ERROR | Unexpected server error |

### GET /api/health

Health check endpoint.

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2026-03-15T12:00:00Z",
  "version": "1.0.0"
}
```

### GET /api/outputs/:id

Retrieve a previously generated image.

**Response:** Serves the JPEG file from the outputs directory.

## Output JSON Structure

The `/api/generate` endpoint returns the full design JSON:

- **cover_title** — Compelling, concise title optimized for the cover (max 100 chars)
- **article_summary** — One-paragraph summary of the article's core argument
- **visual_concept** — Plain-language description of the visual metaphor
- **image_prompt** — Detailed Recraft V4 prompt (visual elements only, no text)
- **negative_prompt** — Explicit exclusions for the image generator
- **detected_language** — `"en"` or `"zh"` based on article content or override
- **color_scheme** — `"dark"` (for English) or `"light"` (for Chinese)
- **layout_spec** — Layout configuration object:
  - **template_variant** — `"A"` (editorial), `"B"` (data), or `"C"` (opinion)
  - **title_alignment** — `"center"` or `"left"`
  - **safe_text_area** — Describes where to place text overlay
  - **logo_position** — `"bottom-right"` (fixed)
  - **overlay_opacity** — Recommended opacity (0.3–0.7) for text readability
- **brand_checklist** — Array of brand compliance confirmations
- **imageUrl** — Public URL to the generated JPG image

## Brand Customization

Edit `/Users/lambai/Documents/PIC/data/brand_brief.json` to customize colors, style rules, and layout templates:

```json
{
  "brand_name": "Your Brand",
  "visual_identity": {
    "dark_variant": { /* English article colors */ },
    "light_variant": { /* Chinese article colors */ }
  },
  "image_style_rules": [ /* Recraft prompt rules */ ],
  "layout_templates": { /* A/B/C layout definitions */ }
}
```

All brand rules are incorporated into the Claude prompt and Recraft image generation.

## Integrating into Your Website

The `/api/generate` endpoint is a standard REST API. Example fetch:

```javascript
const response = await fetch('/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'My Article Title',
    url: 'https://example.com/article',
    language_override: 'en'
  })
});
const result = await response.json();
// Use result.imageUrl to display the generated cover
```

Images are served at `/outputs/[filename].jpg` and can be embedded in HTML, downloaded, or shared directly.

## Error Handling

The system implements graceful fallback logic:

| Scenario | Behavior |
|----------|----------|
| URL scraping fails | Falls back to title-only design (returns 200 with ARTICLE_EXTRACTION_FAILED notice) |
| Extracted content too short | Falls back to title-only design (returns 200 with SHORT_CONTENT notice) |
| Claude produces invalid JSON | Retries up to `CLAUDE_MAX_RETRIES` times; if all fail, returns 502 |
| Recraft API fails | Retries with exponential backoff up to `RECRAFT_MAX_RETRIES` times; if all fail, returns 502 |
| Missing/invalid input | Returns 400 INPUT_VALIDATION_FAILED |
| Unexpected server error | Returns 500 INTERNAL_ERROR with stack trace (dev only) |

## Project Structure

```
/Users/lambai/Documents/PIC/
├── .env                          # Local environment variables (git-ignored)
├── .env.example                  # Template for environment setup
├── .gitignore                    # Git ignore rules
├── package.json                  # Node dependencies and scripts
├── package-lock.json             # Locked dependency versions
├── README.md                      # This file
│
├── src/                          # Application source code
│   ├── server.js                 # Express server entry point
│   ├── routes/
│   │   └── api.js                # API routes (/health, /generate, /outputs/:id)
│   ├── services/
│   │   ├── articleExtractor.js   # URL scraping with Cheerio
│   │   ├── claudeService.js      # Claude Sonnet 4.6 integration
│   │   ├── recraftService.js     # Recraft V4 API integration
│   │   └── validator.js          # AJV schema validation
│   ├── middleware/
│   │   └── errorHandler.js       # Global Express error handler & error classes
│   └── utils/
│       └── logger.js             # Structured logging utility
│
├── public/                       # Static web UI
│   ├── index.html                # Main HTML form
│   ├── css/
│   │   └── styles.css            # UI styling
│   └── js/
│       └── app.js                # Form submission and UI logic
│
├── data/                         # Configuration and templates
│   ├── brand_brief.json          # Brand identity, colors, style rules, layout templates
│   ├── output_schema.json        # JSON schema for validating Claude output
│   └── prompt_templates/
│       ├── main_prompt.txt       # Claude system prompt for cover design
│       └── repair_prompt.txt     # Fallback prompt for title-only designs
│
└── outputs/                      # Generated cover images (git-ignored)
    └── [timestamp]-[jobId].jpg   # Example generated image filename
```

## Development

### Run in development mode
```bash
npm run dev
```
Starts the server with hot-reload via nodemon.

### Run in production
```bash
npm start
```

### Logging

Structured logs include `jobId`, `code`, `statusCode`, and optional stack traces. Configure `LOG_LEVEL` in `.env` to filter output.

## License

MIT
