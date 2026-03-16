# Text Compositor Feature — Design Spec
**Date:** 2026-03-16
**Branch:** feature/text-compositor
**Status:** Approved for implementation

---

## Goal

Add a text overlay compositor to the existing result screen. After Recraft generates the cover image, users can type/edit the title text, select a font, adjust overlay opacity, and download a fully composited JPG — all without leaving the page.

**Not in scope:** Engine switching (Recraft only), style library UI, history page, Next.js migration, Supabase.

---

## Technical Approach

**CSS overlay + html2canvas export.**

- Text is positioned absolutely over the image using CSS (live preview, instant font switching)
- On download: `document.fonts.ready` → html2canvas captures `.cover-compositor` at 2x scale → JPEG 95% → auto-download
- Font files served from `public/fonts/` (same origin, no CORS issues with html2canvas)
- Font config in `data/fonts.json` (drop-in replacement when user provides real files)

---

## UI Layout

Text compositor panel appears below the existing result card after a successful generation.

```
┌─────────────────────────────────────────┐
│  LIVE PREVIEW (.cover-compositor)        │
│  ┌─────────────────────────────────┐    │
│  │  [Base image 1200×675]           │    │
│  │                                  │    │
│  │  ░░░░ gradient overlay ░░░░░░░░  │    │
│  │                                  │    │
│  │  COVER TITLE TEXT                │    │  ← .cover-title-text
│  │  Subtitle text                   │    │  ← .cover-subtitle-text
│  └─────────────────────────────────┘    │
│                                          │
│  Title   [__________________________]   │  ← pre-filled from cover_title
│  Subtitle [_________________________] ○ │  ← pre-filled from subtitle, toggleable
│                                          │
│  Font  ──────────────────────────────   │
│  EN  [Inter ▣] [Playfair ▣] [Font3 ▣]  │
│  中文 [字体一 ▣] [字体二 ▣] [字体三 ▣]  │
│                                          │
│  Overlay  Light ━━━●━━━ Dark   45%      │  ← init from layout_spec.overlay_opacity, step 0.05
│                                          │
│  [↓ Download with text]  [↓ Original]   │
└─────────────────────────────────────────┘
```

---

## File Changes

### New files
- `public/fonts/` — font files directory (populated by user)
- `data/fonts.json` — font configuration (6 entries: 3 EN + 3 ZH)

### Modified files
- `public/index.html` — add `.cover-compositor` and `.text-compositor-panel` sections
- `public/css/styles.css` — overlay styles, font cards, compositor layout
- `public/js/app.js` — font loading, live preview logic, html2canvas export
- `package.json` — add html2canvas (CDN tag in HTML, no npm install needed)

---

## Font Configuration (`data/fonts.json`)

Each font entry has these fields:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier used as CSS class |
| `name` | string | Display name shown on the card |
| `family` | string | CSS `font-family` value used in `@font-face` and text styles |
| `file` | string | Filename in `public/fonts/` (e.g. `Inter.woff2`) |
| `format` | string | Font format hint for `@font-face src`: `"woff2"`, `"truetype"`, `"opentype"` |
| `label` | string | Short style description shown under the name card |
| `language` | string | `"en"` or `"zh"` — determines which group this font belongs to |

```json
{
  "fonts": [
    { "id": "inter", "name": "Inter", "family": "Inter", "file": "Inter.woff2", "format": "woff2", "label": "Modern Sans", "language": "en" },
    { "id": "playfair", "name": "Playfair", "family": "Playfair Display", "file": "PlayfairDisplay.woff2", "format": "woff2", "label": "Editorial Serif", "language": "en" },
    { "id": "en_font3", "name": "TBD", "family": "TBD", "file": "TBD.woff2", "format": "woff2", "label": "TBD", "language": "en" },
    { "id": "zh_font1", "name": "待填入", "family": "ZHFont1", "file": "ZHFont1.woff2", "format": "woff2", "label": "标准黑体", "language": "zh" },
    { "id": "zh_font2", "name": "待填入", "family": "ZHFont2", "file": "ZHFont2.woff2", "format": "woff2", "label": "衬线宋体", "language": "zh" },
    { "id": "zh_font3", "name": "待填入", "family": "ZHFont3", "file": "ZHFont3.woff2", "format": "woff2", "label": "创意字体", "language": "zh" }
  ]
}
```

**Font selector UI behavior:**
- All 6 fonts are shown, split into two labeled rows: "English Fonts" and "中文字体"
- On result load, the font matching `detected_language` from the API response is auto-selected as default (first EN font if `"en"`, first ZH font if `"zh"`)
- User can click any card to switch (cross-language switching is allowed)
- Active card: accent-colored border + subtle background highlight
- Each card renders its `name` label in its own `font-family` so users see the actual typeface

---

## Text Overlay CSS Strategy

```
.cover-compositor
  position: relative
  width: 100%
  aspect-ratio: 16/9

  img.compositor-base-image
    position: absolute, inset: 0, width: 100%, height: 100%, object-fit: cover

  .compositor-overlay
    position: absolute, inset: 0
    background: linear-gradient(to top, rgba(0,0,0,opacity) 60%, transparent)
    transition: opacity 200ms

  .compositor-text
    position: absolute
    bottom: 8%, left: 6%, right: 6%   ← for template A/C
    (or centered for template B)

    .compositor-title
      font-size: clamp(1.5rem, 4vw, 3rem)
      font-weight: 700
      color: #fff (dark) or #1A202C (light)
      line-height: 1.15

    .compositor-subtitle
      font-size: clamp(0.9rem, 2vw, 1.4rem)
      opacity: 0.85
      margin-top: 0.5em
```

Text position adapts from `layout_spec.template_variant` returned by Claude.

---

## html2canvas Export

Images are always served from `/outputs/` (same origin). However, `recraftService.js` has a fallback path where local download fails and `imageUrl` becomes the raw Recraft CDN URL (cross-origin). To prevent a silent blank canvas, we proxy the fallback through the server:

**New endpoint:** `GET /api/proxy-image?url=<encoded>` — downloads the remote image, transcodes it to JPEG via `sharp` (`.jpeg({ quality: 95 })`), and streams it back with `Content-Type: image/jpeg`. This handles any upstream format (PNG, WebP, JPEG) uniformly. The frontend checks: if `imageUrl` starts with `http`, call this proxy first to get a same-origin JPEG URL, then set it as the `src` of the compositor image.

This guarantees `useCORS: false` is always safe.

```javascript
async function downloadComposited(titleSlug) {
  const compositor = document.querySelector('.cover-compositor');
  await document.fonts.ready; // ensure all custom fonts loaded
  const canvas = await html2canvas(compositor, {
    scale: 2,           // 2400×1350 output
    useCORS: false,     // always same-origin after proxy
    allowTaint: false,
    logging: false,
    backgroundColor: null
  });
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cover-${titleSlug}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/jpeg', 0.95);
}
```

---

## Font Loading Strategy

`GET /api/fonts` endpoint:
- Reads `data/fonts.json`
- Skips any font entry whose `file` does not exist in `public/fonts/` (silent omit, no error)
- Generates `@font-face` CSS for valid fonts only
- Returns response with `Content-Type: text/plain`
- Frontend inserts result as a `<style>` element in `<head>` on page load

This means: adding a font = drop file in `public/fonts/` + update `fonts.json`. No HTML edits needed. Missing font files degrade gracefully to system fonts.

---

## State Machine Change

Existing states: `form → loading → result → error`

No new states added. The compositor panel is part of the `result` state — it renders automatically when `setState('result')` is called and `data.imageUrl` is present.

---

## Recraft Style ID (pending)

When user provides Recraft style IDs, update `recraftService.js`:
```js
// Add to request body conditionally:
...(styleId && { style_id: styleId })
```
And expose as optional field on `POST /api/generate`: `{ ..., style_id: "xxx" }`.
This is deferred until user provides the IDs.

---

## Verification Checklist

- [ ] Font cards render font name in its own typeface
- [ ] Switching font updates preview instantly (no reload)
- [ ] Title/subtitle input changes reflect in preview in real time
- [ ] Overlay opacity slider updates gradient in real time
- [ ] Download produces 2400×1350 JPEG with text baked in
- [ ] Text is readable on both dark and light color schemes
- [ ] Subtitle toggle shows/hides subtitle in preview and export
- [ ] Download original image still works (existing behavior unchanged)
- [ ] Auto-selects EN fonts for English articles, ZH fonts for Chinese
