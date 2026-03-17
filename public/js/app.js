/* ============================================================
   Twitter Cover Generator — Application Logic
   ============================================================ */

'use strict';

(function () {

  /* ----------------------------------------------------------
     Constants
  ---------------------------------------------------------- */
  var LOADING_MESSAGES = [
    'Analyzing article content...',
    'Building visual concept with Claude AI...',
    'Generating cover image with Recraft V4...',
    'Finalizing your cover...'
  ];

  var MESSAGE_INTERVAL_MS = 3000;

  /* ----------------------------------------------------------
     DOM References
  ---------------------------------------------------------- */
  var sections = {
    form:    document.getElementById('form-section'),
    loading: document.getElementById('loading-section'),
    result:  document.getElementById('result-section'),
    error:   document.getElementById('error-section')
  };

  var formEl           = document.getElementById('generate-form');
  var titleInput       = document.getElementById('title');
  var urlInput         = document.getElementById('url');
  var categoryInput    = document.getElementById('category');
  var langSelect       = document.getElementById('language-override');
  var titleError       = document.getElementById('title-error');

  var loadingMsg       = document.getElementById('loading-message');
  var stepDots         = Array.from(document.querySelectorAll('.step-dot'));

  var resultImage      = document.getElementById('result-image');
  var resultCoverTitle = document.getElementById('result-cover-title');
  var resultSubtitle   = document.getElementById('result-subtitle');
  var schemeBadge      = document.getElementById('result-scheme-badge');
  var tagsList         = document.getElementById('result-tags');
  var langBadge        = document.getElementById('result-lang-badge');
  var downloadBtn      = document.getElementById('download-btn');
  var copyPromptBtn    = document.getElementById('copy-prompt-btn');
  var anotherBtn       = document.getElementById('another-btn');

  var specToggle       = document.getElementById('spec-toggle');
  var specContent      = document.getElementById('spec-content');
  var specJson         = document.getElementById('spec-json');

  var errorMessage     = document.getElementById('error-message');
  var retryBtn         = document.getElementById('retry-btn');

  var toast            = document.getElementById('copy-toast');

  /* ----------------------------------------------------------
     Compositor DOM References
  ---------------------------------------------------------- */
  var compositorEl       = document.getElementById('cover-compositor');
  var compositorImg      = document.getElementById('compositor-base-image');
  var compositorOverlay  = document.getElementById('compositor-overlay');
  var compositorTextEl   = document.getElementById('compositor-text');
  var compositorTitleEl  = document.getElementById('compositor-title');
  var compositorSubEl    = document.getElementById('compositor-subtitle');

  var compTitleInput     = document.getElementById('compositor-title-input');
  var compSubtitleInput  = document.getElementById('compositor-subtitle-input');
  var subtitleToggle     = document.getElementById('compositor-subtitle-toggle');
  var opacitySlider      = document.getElementById('compositor-opacity');
  var opacityValueEl     = document.getElementById('compositor-opacity-value');
  var fontColorPicker    = document.getElementById('compositor-font-color');
  var colorSwatchesEl    = document.getElementById('compositor-color-swatches');
  var fontCardsEn        = document.getElementById('font-cards-en');
  var fontCardsZh        = document.getElementById('font-cards-zh');
  var compositorDlBtn    = document.getElementById('compositor-download-btn');
  var downloadOriginalBtn = document.getElementById('download-original-btn');

  var authorInput          = document.getElementById('author');
  var platformSelect       = document.getElementById('platform');

  var compositorTextureLayer = document.getElementById('compositor-texture-layer');
  var compositorAuthorEl   = document.getElementById('compositor-author');
  var compositorDecorEl    = document.getElementById('compositor-decorator');
  var textVisibilityToggle = document.getElementById('compositor-text-toggle');
  var hposBtns             = document.getElementById('compositor-hpos-btns');

  var tabAi              = document.getElementById('tab-ai');
  var tabText            = document.getElementById('tab-text');
  var aiModeFields       = document.getElementById('ai-mode-fields');
  var textModeFields     = document.getElementById('text-mode-fields');
  var bgDarkBtn          = document.getElementById('bg-dark-btn');
  var bgLightBtn         = document.getElementById('bg-light-btn');

  /* ----------------------------------------------------------
     State
  ---------------------------------------------------------- */
  var currentState   = 'form';
  var loadingTimerId = null;
  var toastTimerId   = null;
  var msgIndex       = 0;
  var fontsConfig       = [];   // array of font objects from /api/fonts-config
  var pendingDefaultLang = null;
  var selectedStyleId = null;
  var platformsMap = {};
  var lastTextHighlights = []; // stores array from last Claude layout call
  var currentMode    = 'ai';   // 'ai' | 'text'
  var textBgChoice   = 'dark'; // 'dark' | 'light'

  /* ----------------------------------------------------------
     Mode Tab Switching
  ---------------------------------------------------------- */
  function switchMode(mode) {
    currentMode = mode;

    tabAi.classList.toggle('active', mode === 'ai');
    tabAi.setAttribute('aria-selected', String(mode === 'ai'));
    tabText.classList.toggle('active', mode === 'text');
    tabText.setAttribute('aria-selected', String(mode === 'text'));

    if (aiModeFields)   aiModeFields.hidden   = (mode === 'text');
    if (textModeFields) textModeFields.hidden = (mode === 'ai');
  }

  if (tabAi)   tabAi.addEventListener('click',   function () { switchMode('ai'); });
  if (tabText) tabText.addEventListener('click',  function () { switchMode('text'); });

  if (bgDarkBtn) bgDarkBtn.addEventListener('click', function () {
    textBgChoice = 'dark';
    bgDarkBtn.classList.add('active');
    if (bgLightBtn) bgLightBtn.classList.remove('active');
  });

  if (bgLightBtn) bgLightBtn.addEventListener('click', function () {
    textBgChoice = 'light';
    bgLightBtn.classList.add('active');
    if (bgDarkBtn) bgDarkBtn.classList.remove('active');
  });

  /* ----------------------------------------------------------
     State Machine
  ---------------------------------------------------------- */
  function setState(name) {
    if (currentState === name) return;

    // Stop loading interval on any state change
    if (loadingTimerId !== null) {
      clearInterval(loadingTimerId);
      loadingTimerId = null;
    }

    // Hide all sections
    Object.keys(sections).forEach(function (key) {
      var el = sections[key];
      el.classList.remove('active');
      el.hidden = true;
    });

    currentState = name;
    var target = sections[name];
    if (!target) return;

    target.hidden = false;

    // Trigger fade-in on next frame
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        target.classList.add('active');
      });
    });

    if (name === 'loading') {
      startLoadingMessages();
    }
  }

  /* ----------------------------------------------------------
     Loading Message Rotator
  ---------------------------------------------------------- */
  function startLoadingMessages() {
    msgIndex = 0;
    setLoadingMessage(msgIndex);

    loadingTimerId = setInterval(function () {
      msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
      fadeToMessage(msgIndex);
      updateStepDots(msgIndex);
    }, MESSAGE_INTERVAL_MS);
  }

  function setLoadingMessage(index) {
    loadingMsg.textContent = LOADING_MESSAGES[index];
    updateStepDots(index);
  }

  function fadeToMessage(index) {
    loadingMsg.classList.add('fading');
    setTimeout(function () {
      loadingMsg.textContent = LOADING_MESSAGES[index];
      loadingMsg.classList.remove('fading');
    }, 200);
  }

  function updateStepDots(activeIndex) {
    stepDots.forEach(function (dot, i) {
      dot.classList.toggle('active', i === activeIndex);
    });
  }

  /* ----------------------------------------------------------
     Form Validation & Submission
  ---------------------------------------------------------- */
  formEl.addEventListener('submit', function (e) {
    e.preventDefault();

    var title = titleInput.value.trim();

    // Validation
    if (!title) {
      showTitleError(true);
      titleInput.classList.add('invalid');
      titleInput.focus();
      return;
    }

    showTitleError(false);
    titleInput.classList.remove('invalid');

    if (currentMode === 'text') {
      generateTextOnlyCover({
        title: title,
        bg: textBgChoice,
        author: authorInput ? authorInput.value.trim() : '',
        platform: platformSelect ? platformSelect.value : 'twitter_article'
      });
      return;
    }

    var url               = urlInput.value.trim();
    var category          = categoryInput.value.trim();
    var language_override = langSelect.value;

    generateCover({
      title: title,
      url: url,
      category: category,
      language_override: language_override,
      style_id: selectedStyleId,
      author: authorInput ? authorInput.value.trim() : '',
      platform: platformSelect ? platformSelect.value : 'twitter_article'
    });
  });

  titleInput.addEventListener('input', function () {
    if (titleInput.value.trim()) {
      showTitleError(false);
      titleInput.classList.remove('invalid');
    }
  });

  function showTitleError(show) {
    titleError.hidden = !show;
  }

  /* ----------------------------------------------------------
     API Call
  ---------------------------------------------------------- */
  function generateCover(payload) {
    setState('loading');

    fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          var msg = (result.data && result.data.error)
            ? result.data.error
            : 'Server returned status ' + result.status + '. Please try again.';
          showError(msg);
          return;
        }
        showResult(result.data);
      })
      .catch(function (err) {
        var msg = err && err.message
          ? 'Network error: ' + err.message
          : 'Unable to reach the server. Please check your connection.';
        showError(msg);
      });
  }

  /* ----------------------------------------------------------
     Utility: Remove all child nodes safely (no innerHTML)
  ---------------------------------------------------------- */
  function clearChildren(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  /* ----------------------------------------------------------
     Populate Result
  ---------------------------------------------------------- */
  function showResult(data) {
    // Image
    resultImage.src = data.imageUrl || '';
    resultImage.alt = data.cover_title
      ? 'Generated cover: ' + data.cover_title
      : 'Generated article cover';

    // Title
    resultCoverTitle.textContent = data.cover_title || '';

    // Subtitle
    if (data.subtitle) {
      resultSubtitle.textContent = data.subtitle;
      resultSubtitle.hidden = false;
    } else {
      resultSubtitle.textContent = '';
      resultSubtitle.hidden = true;
    }

    // Color scheme badge
    var theme = (data.color_scheme || '').toLowerCase();
    schemeBadge.textContent = theme === 'light' ? 'Light theme' : 'Dark theme';
    schemeBadge.className = 'scheme-badge ' + (theme === 'light' ? 'light' : 'dark');

    // Tags — build using safe DOM methods only
    clearChildren(tagsList);
    var tags = Array.isArray(data.topic_tags) ? data.topic_tags : [];
    tags.forEach(function (tag) {
      var span = document.createElement('span');
      span.className = 'tag';
      span.textContent = tag;
      span.setAttribute('role', 'listitem');
      tagsList.appendChild(span);
    });

    // Language badge
    if (data.detected_language) {
      langBadge.textContent = data.detected_language;
      langBadge.hidden = false;
    } else {
      langBadge.textContent = '';
      langBadge.hidden = true;
    }

    // Download button
    downloadBtn.href = data.imageUrl || '#';
    downloadBtn.download = slugify(data.cover_title || 'cover') + '.jpg';

    // Copy prompt button
    var imagePrompt = data.image_prompt || '';
    copyPromptBtn.onclick = function () {
      copyToClipboard(imagePrompt, 'Prompt copied!');
    };
    copyPromptBtn.disabled = !imagePrompt;

    // Design spec — use textContent (safe, no XSS risk)
    var spec = data.layout_spec || data;
    try {
      specJson.textContent = JSON.stringify(spec, null, 2);
    } catch (e) {
      specJson.textContent = String(spec);
    }

    // Reset spec toggle state
    specToggle.setAttribute('aria-expanded', 'false');
    specContent.hidden = true;

    initCompositor(data);

    setState('result');
  }

  /* ----------------------------------------------------------
     Show Error
  ---------------------------------------------------------- */
  function showError(message) {
    // message may be a string, an Error object, or an API error object {code, message}
    var text;
    if (!message) {
      text = 'An unexpected error occurred. Please try again.';
    } else if (typeof message === 'string') {
      text = message;
    } else if (message.message) {
      text = message.code ? '[' + message.code + '] ' + message.message : message.message;
    } else {
      text = JSON.stringify(message);
    }
    errorMessage.textContent = text;
    setState('error');
  }

  /* ----------------------------------------------------------
     Retry / Reset
  ---------------------------------------------------------- */
  retryBtn.addEventListener('click', function () {
    setState('form');
  });

  anotherBtn.addEventListener('click', function () {
    formEl.reset();
    showTitleError(false);
    titleInput.classList.remove('invalid');
    // Reset text-only state
    compositorEl.classList.remove('cover-compositor--text-only');
    compositorImg.style.display = '';
    compositorOverlay.style.display = '';
    var opacityField = opacitySlider && opacitySlider.closest('.compositor-field');
    if (opacityField) opacityField.style.display = '';
    downloadOriginalBtn.style.display = '';
    var resultCard = document.querySelector('.result-card');
    if (resultCard) resultCard.style.display = '';
    setState('form');
  });

  /* ----------------------------------------------------------
     Design Spec Toggle
  ---------------------------------------------------------- */
  specToggle.addEventListener('click', function () {
    var isExpanded = specToggle.getAttribute('aria-expanded') === 'true';
    var nextState = !isExpanded;
    specToggle.setAttribute('aria-expanded', String(nextState));
    specContent.hidden = !nextState;
  });

  /* ----------------------------------------------------------
     Clipboard Copy
  ---------------------------------------------------------- */
  function copyToClipboard(text, successMsg) {
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast(successMsg || 'Copied!');
      }).catch(function () {
        fallbackCopy(text, successMsg);
      });
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.top = '0';
    ta.style.left = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      showToast(successMsg || 'Copied!');
    } catch (e) {
      showToast('Copy failed — please copy manually.');
    }
    document.body.removeChild(ta);
  }

  /* ----------------------------------------------------------
     Toast Notification
  ---------------------------------------------------------- */
  function showToast(message) {
    if (toastTimerId !== null) {
      clearTimeout(toastTimerId);
      toast.classList.remove('visible');
    }
    toast.textContent = message;
    requestAnimationFrame(function () {
      toast.classList.add('visible');
    });
    toastTimerId = setTimeout(function () {
      toast.classList.remove('visible');
      toastTimerId = null;
    }, 2500);
  }

  /* ----------------------------------------------------------
     Utility: Slugify for download filename
  ---------------------------------------------------------- */
  function slugify(str) {
    return str
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 60) || 'cover';
  }

  /* ----------------------------------------------------------
     Highlight Segments Builder
  ---------------------------------------------------------- */
  /**
   * Extract a short watermark keyword from the title.
   * Skips filler words; returns the first meaty word, uppercased.
   */
  function extractWatermark(title) {
    var SKIP = /^(的|了|和|是|在|也|都|但|因|为|与|及|或|这|那|与|不|a|an|the|is|in|on|at|to|of|and|or|but|for|with|by)$/i;
    var words = title.trim().split(/[\s，,。.！!？?：:；;、]+/).filter(Boolean);
    for (var i = 0; i < words.length; i++) {
      var w = words[i].replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
      if (w.length > 1 && !SKIP.test(w)) return w.toUpperCase().substring(0, 10);
    }
    return (words[0] || '').toUpperCase().substring(0, 10);
  }

  function buildHighlightSegments(title, phrases) {
    if (!phrases.length) return [{ text: title, highlight: false }];
    var segments = [];
    var i = 0;
    var pos = 0;
    while (i < title.length) {
      var matched = false;
      for (var h = 0; h < phrases.length; h++) {
        var phrase = phrases[h];
        if (!phrase) continue;
        if (title.substr(i, phrase.length).toLowerCase() === phrase.toLowerCase()) {
          if (i > pos) segments.push({ text: title.slice(pos, i), highlight: false });
          segments.push({ text: title.slice(i, i + phrase.length), highlight: true });
          pos = i + phrase.length;
          i = pos;
          matched = true;
          break;
        }
      }
      if (!matched) i++;
    }
    if (pos < title.length) segments.push({ text: title.slice(pos), highlight: false });
    return segments;
  }

  function applyHighlightsToElement(el, title, highlightsInput) {
    clearChildren(el);
    // Accept either string (comma-separated) or array
    var phrases;
    if (Array.isArray(highlightsInput)) {
      phrases = highlightsInput.map(function (s) { return s.trim(); }).filter(Boolean);
    } else {
      phrases = (highlightsInput || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }
    var segments = buildHighlightSegments(title, phrases);
    segments.forEach(function (seg) {
      if (seg.highlight) {
        var mark = document.createElement('mark');
        mark.className = 'text-highlight';
        mark.textContent = seg.text;
        el.appendChild(mark);
      } else {
        el.appendChild(document.createTextNode(seg.text));
      }
    });
  }

  /* ----------------------------------------------------------
     Text-Only Cover Generation (Claude-driven layout)
  ---------------------------------------------------------- */
  function generateTextOnlyCover(opts) {
    setState('loading');

    fetch('/api/text-cover-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: opts.title, bg: opts.bg })
    })
      .then(function (res) { return res.json(); })
      .then(function (layout) {
        renderTextOnlyResult(opts, layout);
      })
      .catch(function () {
        // Fallback to defaults if Claude call fails
        renderTextOnlyResult(opts, {
          highlighted_phrases: [],
          text_alignment: 'left',
          title_size: opts.title.length <= 8 ? 'large' : opts.title.length <= 18 ? 'medium' : 'small',
          texture_variant: 'paper'
        });
      });
  }

  function renderTextOnlyResult(opts, layout) {
    var bgColor   = opts.bg === 'light' ? '#F5F7FA' : '#0A0A0A';
    var textColor = opts.bg === 'light' ? '#111827' : '#FFFFFF';
    var authorVal = opts.author
      ? (opts.author.startsWith('@') ? opts.author : '@' + opts.author)
      : '';

    // Apply platform ratio
    if (opts.platform && platformsMap[opts.platform] && compositorEl) {
      compositorEl.style.setProperty('--platform-ratio', platformsMap[opts.platform].cssRatio);
    }

    // Switch compositor to text-only mode
    compositorEl.classList.add('cover-compositor--text-only');
    compositorEl.style.setProperty('--solid-bg', bgColor);
    compositorEl.dataset.textBg = opts.bg;
    compositorEl.dataset.texture = layout.texture_variant || 'paper';

    // Apply texture to texture layer
    if (compositorTextureLayer) {
      compositorTextureLayer.className = 'compositor-texture-layer texture-' + (layout.texture_variant || 'paper');
      compositorTextureLayer.dataset.bg = opts.bg;
    }

    // Hide base image and overlay
    compositorImg.style.display = 'none';
    compositorOverlay.style.display = 'none';

    // Apply highlighted title using safe DOM methods
    applyHighlightsToElement(compositorTitleEl, opts.title, layout.highlighted_phrases || []);
    lastTextHighlights = layout.highlighted_phrases || [];
    compositorSubEl.textContent = '';
    compositorSubEl.hidden = true;

    // Ghost watermark: first highlighted phrase, or extracted keyword from title
    var watermarkWord = (layout.highlighted_phrases && layout.highlighted_phrases[0])
      || extractWatermark(opts.title);
    compositorTextEl.dataset.watermark = watermarkWord;

    // Author (CSS positions this at absolute top-left in text-only mode)
    if (compositorAuthorEl) compositorAuthorEl.textContent = authorVal;

    // Text color
    applyFontColor(textColor);
    fontColorPicker.value = textColor;

    // Apply layout decisions from Claude
    compTitleInput.value = opts.title;
    compSubtitleInput.value = '';
    subtitleToggle.checked = false;
    applyHpos(layout.text_alignment || 'left');
    applyTitleSize(layout.title_size || 'medium');

    // Hide overlay slider (no overlay in text-only)
    var opacityField = opacitySlider && opacitySlider.closest('.compositor-field');
    if (opacityField) opacityField.style.display = 'none';

    // Update download original button
    downloadOriginalBtn.href = '#';
    downloadOriginalBtn.style.display = 'none';

    // Auto-select default font based on language detection
    var hasZh = /[\u4e00-\u9fa5]/.test(opts.title);
    pendingDefaultLang = hasZh ? 'zh' : 'en';
    if (fontsConfig.length) applyDefaultFont(pendingDefaultLang);

    // Hide result-card metadata section (no Claude image data)
    var resultCard = document.querySelector('.result-card');
    if (resultCard) resultCard.style.display = 'none';

    setState('result');
  }

  /* ----------------------------------------------------------
     Style Selector
  ---------------------------------------------------------- */
  function loadStyleSelector() {
    fetch('/api/recraft-styles')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var styles = Array.isArray(data.styles) ? data.styles : [];
        if (styles.length === 0) return; // no styles configured — hide selector

        selectedStyleId = data.default || (styles[0] && styles[0].id) || null;

        var container = document.getElementById('style-cards');
        var fieldGroup = document.getElementById('style-field-group');
        if (!container || !fieldGroup) return;

        clearChildren(container);
        // Prepend Auto (no style) option
        var autoBtn = document.createElement('button');
        autoBtn.type = 'button';
        autoBtn.className = 'style-card';
        autoBtn.dataset.styleId = '';
        autoBtn.setAttribute('aria-label', 'Auto — no style constraint');
        var autoNameEl = document.createElement('span');
        autoNameEl.className = 'style-card__name';
        autoNameEl.textContent = 'Auto (AI decides)';
        autoBtn.appendChild(autoNameEl);
        autoBtn.addEventListener('click', function () {
          selectedStyleId = null;
          document.querySelectorAll('.style-card').forEach(function (c) {
            c.classList.toggle('active', c.dataset.styleId === '');
          });
        });
        container.appendChild(autoBtn);
        styles.forEach(function (style) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'style-card' + (style.id === selectedStyleId ? ' active' : '');
          btn.dataset.styleId = style.id;
          btn.setAttribute('aria-label', 'Select ' + style.name);

          var nameEl = document.createElement('span');
          nameEl.className = 'style-card__name';
          nameEl.textContent = style.note || style.name;

          btn.appendChild(nameEl);
          btn.addEventListener('click', function () {
            selectedStyleId = style.id;
            var allCards = document.querySelectorAll('.style-card');
            allCards.forEach(function (c) {
              c.classList.toggle('active', c.dataset.styleId === style.id);
            });
          });
          container.appendChild(btn);
        });

        fieldGroup.style.display = '';
      })
      .catch(function () { /* styles unavailable — degrade gracefully */ });
  }

  /* ----------------------------------------------------------
     Platform Selector
  ---------------------------------------------------------- */
  function loadPlatforms() {
    fetch('/api/platforms')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var platforms = data.platforms || [];
        var defaultId = data.default || '';
        if (!platformSelect) return;
        clearChildren(platformSelect);
        platforms.forEach(function (p) {
          var opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.label + (p.comingSoon ? ' (coming soon)' : '');
          opt.disabled = !!p.comingSoon;
          if (p.id === defaultId) opt.selected = true;
          platformSelect.appendChild(opt);
        });
        platformsMap = {};
        platforms.forEach(function (p) { platformsMap[p.id] = p; });
        applyPlatformRatio(defaultId);
      })
      .catch(function () { /* degrade gracefully */ });
  }

  function applyPlatformRatio(platformId) {
    var p = platformsMap && platformsMap[platformId];
    if (!p || !compositorEl) return;
    compositorEl.style.setProperty('--platform-ratio', p.cssRatio);
  }

  /* ----------------------------------------------------------
     Font Loading
  ---------------------------------------------------------- */
  function loadFonts() {
    fetch('/api/fonts')
      .then(function (res) { return res.text(); })
      .then(function (css) {
        if (!css) return;
        var style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
      })
      .catch(function () { /* fonts unavailable — degrade gracefully */ });

    fetch('/api/fonts-config')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        fontsConfig = Array.isArray(data) ? data : [];
        buildFontCards();
        if (pendingDefaultLang) applyDefaultFont(pendingDefaultLang);
      })
      .catch(function () { fontsConfig = []; });
  }

  /* ----------------------------------------------------------
     Font Cards
  ---------------------------------------------------------- */
  function buildFontCards() {
    var enFonts = fontsConfig.filter(function (f) { return f.language === 'en'; });
    var zhFonts = fontsConfig.filter(function (f) { return f.language === 'zh'; });

    renderFontGroup(enFonts, fontCardsEn);
    renderFontGroup(zhFonts, fontCardsZh);
  }

  function renderFontGroup(fonts, container) {
    if (!container) return;
    clearChildren(container);
    fonts.forEach(function (font) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'font-card';
      card.dataset.fontId = font.id;
      card.setAttribute('aria-label', font.name + ' font');

      var nameEl = document.createElement('span');
      nameEl.className = 'font-card__name';
      nameEl.textContent = font.name;
      nameEl.style.fontFamily = "'" + font.family + "', sans-serif";

      var labelEl = document.createElement('span');
      labelEl.className = 'font-card__label';
      labelEl.textContent = font.label;

      card.appendChild(nameEl);
      card.appendChild(labelEl);
      card.addEventListener('click', function () { selectFont(font); });
      container.appendChild(card);
    });
  }

  function selectFont(font) {
    // Update active card highlight
    var allCards = document.querySelectorAll('.font-card');
    allCards.forEach(function (c) {
      c.classList.toggle('active', c.dataset.fontId === font.id);
    });
    // Apply font to compositor text
    var fontStack = "'" + font.family + "', sans-serif";
    compositorTitleEl.style.fontFamily = fontStack;
    compositorSubEl.style.fontFamily = fontStack;
  }

  function applyDefaultFont(lang) {
    if (!fontsConfig.length) return; // will be called again after load
    var defaultFont = fontsConfig.find(function (f) { return f.language === lang; });
    if (!defaultFont) defaultFont = fontsConfig[0];
    if (defaultFont) selectFont(defaultFont);
  }

  /* ----------------------------------------------------------
     Compositor Initialization
  ---------------------------------------------------------- */
  function initCompositor(data) {
    // Reset from any previous text-only mode
    compositorEl.classList.remove('cover-compositor--text-only');
    compositorImg.style.display = '';
    compositorOverlay.style.display = '';
    // Clear watermark ghost
    compositorTextEl.dataset.watermark = '';
    var opacityField = opacitySlider && opacitySlider.closest('.compositor-field');
    if (opacityField) opacityField.style.display = '';
    downloadOriginalBtn.style.display = '';
    var resultCard = document.querySelector('.result-card');
    if (resultCard) resultCard.style.display = '';

    // Set image — proxy if it's a remote URL
    var imageUrl = data.imageUrl || '';
    if (imageUrl.startsWith('http')) {
      imageUrl = '/api/proxy-image?url=' + encodeURIComponent(imageUrl);
    }
    compositorImg.src = imageUrl;
    compositorImg.alt = data.cover_title || 'Cover image';

    // Populate text from API data
    compTitleInput.value = data.cover_title || '';
    compSubtitleInput.value = data.subtitle || '';
    compositorTitleEl.textContent = data.cover_title || '';
    compositorSubEl.textContent = data.subtitle || '';

    // Subtitle visibility
    var hasSubtitle = !!data.subtitle;
    subtitleToggle.checked = hasSubtitle;
    compositorSubEl.hidden = !hasSubtitle;

    // Text color: default white, user can change via color picker
    applyFontColor('#ffffff');
    fontColorPicker.value = '#ffffff';

    // Text horizontal position from Claude's layout_spec
    var hpos = (data.layout_spec && data.layout_spec.text_x_position) || 'left';
    applyHpos(hpos);

    // Decorator
    var decorator = (data.layout_spec && data.layout_spec.decorator) || 'none';
    compositorTextEl.dataset.decorator = decorator;

    // Title size
    var titleSize = (data.layout_spec && data.layout_spec.title_size) || 'medium';
    applyTitleSize(titleSize);

    // Author
    var authorVal = data.author || '';
    if (compositorAuthorEl) {
      compositorAuthorEl.textContent = authorVal
        ? (authorVal.startsWith('@') ? authorVal : '@' + authorVal)
        : '';
    }

    // Update compositor aspect ratio from platformCfg
    if (data.platformCfg && data.platformCfg.cssRatio && compositorEl) {
      compositorEl.style.setProperty('--platform-ratio', data.platformCfg.cssRatio);
    }

    // Overlay opacity from layout_spec (default 0.45)
    var opacity = 0.45;
    if (data.layout_spec && typeof data.layout_spec.overlay_opacity === 'number') {
      opacity = data.layout_spec.overlay_opacity;
    }
    opacitySlider.value = String(opacity);
    updateOverlayOpacity(opacity);

    // Hide old image wrap, show compositor
    var oldWrap = document.querySelector('.result-image-wrap');
    if (oldWrap) oldWrap.classList.add('compositor-active');

    // Auto-select default font based on detected_language
    pendingDefaultLang = (data.detected_language || 'en').toLowerCase();
    applyDefaultFont(pendingDefaultLang);

    // Wire download original button
    downloadOriginalBtn.href = data.imageUrl || '#';
    downloadOriginalBtn.download = slugify(data.cover_title || 'cover') + '.jpg';
  }

  function updateOverlayOpacity(value) {
    compositorOverlay.style.setProperty('--overlay-opacity', value);
    opacityValueEl.textContent = Math.round(value * 100) + '%';
  }

  function applyFontColor(hex) {
    compositorTitleEl.style.color = hex;
    compositorSubEl.style.color = hex;
  }

  function applyHpos(pos) {
    compositorTextEl.dataset.hpos = pos;
    if (hposBtns) {
      var btns = hposBtns.querySelectorAll('.compositor-hpos-btn');
      btns.forEach(function (b) {
        b.classList.toggle('active', b.dataset.pos === pos);
      });
    }
  }

  function applyTitleSize(size) {
    compositorTitleEl.classList.remove('title-large', 'title-medium', 'title-small');
    if (size) compositorTitleEl.classList.add('title-' + size);
  }

  /* ----------------------------------------------------------
     Live Preview Listeners
  ---------------------------------------------------------- */
  function initCompositorListeners() {
    compTitleInput.addEventListener('input', function () {
      if (compositorEl.classList.contains('cover-compositor--text-only')) {
        applyHighlightsToElement(compositorTitleEl, compTitleInput.value, lastTextHighlights);
      } else {
        compositorTitleEl.textContent = compTitleInput.value;
      }
    });

    compSubtitleInput.addEventListener('input', function () {
      compositorSubEl.textContent = compSubtitleInput.value;
    });

    subtitleToggle.addEventListener('change', function () {
      compositorSubEl.hidden = !subtitleToggle.checked;
    });

    opacitySlider.addEventListener('input', function () {
      updateOverlayOpacity(parseFloat(opacitySlider.value));
    });

    // Font color picker
    fontColorPicker.addEventListener('input', function () {
      applyFontColor(fontColorPicker.value);
      // Deactivate all swatches when custom color is chosen
      var swatches = colorSwatchesEl.querySelectorAll('.compositor-color-swatch');
      swatches.forEach(function (s) { s.classList.remove('active'); });
    });

    // Color preset swatches
    var COLOR_PRESETS = [
      { hex: '#ffffff', label: 'White' },
      { hex: '#000000', label: 'Black' },
      { hex: '#F5F0E8', label: 'Cream' },
      { hex: '#FFD700', label: 'Gold' },
      { hex: '#00FFAA', label: 'Mint' },
      { hex: '#60A5FA', label: 'Sky' }
    ];
    COLOR_PRESETS.forEach(function (preset) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'compositor-color-swatch' + (preset.hex === '#ffffff' ? ' active' : '');
      btn.style.background = preset.hex;
      // Add a subtle border for white swatch visibility
      if (preset.hex === '#ffffff') btn.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.15)';
      btn.setAttribute('aria-label', preset.label);
      btn.setAttribute('title', preset.label);
      btn.addEventListener('click', function () {
        applyFontColor(preset.hex);
        fontColorPicker.value = preset.hex;
        colorSwatchesEl.querySelectorAll('.compositor-color-swatch').forEach(function (s) {
          s.classList.remove('active');
        });
        btn.classList.add('active');
      });
      colorSwatchesEl.appendChild(btn);
    });

    // Text visibility toggle
    if (textVisibilityToggle) {
      textVisibilityToggle.addEventListener('change', function () {
        compositorTextEl.style.visibility = textVisibilityToggle.checked ? '' : 'hidden';
      });
    }

    // H-position buttons
    if (hposBtns) {
      var hposBtnEls = hposBtns.querySelectorAll('.compositor-hpos-btn');
      hposBtnEls.forEach(function (btn) {
        btn.addEventListener('click', function () {
          applyHpos(btn.dataset.pos);
        });
      });
    }

    compositorDlBtn.addEventListener('click', function () {
      var titleSlug = slugify(compTitleInput.value || 'cover');
      downloadComposited(titleSlug);
    });

    if (platformSelect) {
      platformSelect.addEventListener('change', function () {
        applyPlatformRatio(platformSelect.value);
      });
    }
  }

  /* ----------------------------------------------------------
     html2canvas Export
  ---------------------------------------------------------- */
  function downloadComposited(titleSlug) {
    if (typeof html2canvas === 'undefined') {
      showToast('html2canvas not loaded — please refresh.');
      return;
    }
    compositorDlBtn.classList.add('is-loading');
    compositorDlBtn.disabled = true;

    document.fonts.ready.then(function () {
      return html2canvas(compositorEl, {
        scale: 2,
        useCORS: false,
        allowTaint: false,
        logging: false,
        backgroundColor: null
      });
    }).then(function (canvas) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          showToast('Export failed: could not encode image.');
          compositorDlBtn.classList.remove('is-loading');
          compositorDlBtn.disabled = false;
          return;
        }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'cover-' + titleSlug + '.jpg';
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/jpeg', 0.95);
    }).catch(function (err) {
      showToast('Export failed: ' + (err && err.message ? err.message : 'unknown error'));
    }).finally(function () {
      compositorDlBtn.classList.remove('is-loading');
      compositorDlBtn.disabled = false;
    });
  }

  /* ----------------------------------------------------------
     Init — form section is active by default via HTML class,
     call setState to register currentState correctly.
  ---------------------------------------------------------- */
  loadFonts();
  loadStyleSelector();
  loadPlatforms();
  initCompositorListeners();
  currentState = 'loading'; // trick setState into running for 'form'
  setState('form');

})();
