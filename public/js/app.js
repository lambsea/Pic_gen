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
  var fontCardsEn        = document.getElementById('font-cards-en');
  var fontCardsZh        = document.getElementById('font-cards-zh');
  var compositorDlBtn    = document.getElementById('compositor-download-btn');
  var downloadOriginalBtn = document.getElementById('download-original-btn');

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

    var url               = urlInput.value.trim();
    var category          = categoryInput.value.trim();
    var language_override = langSelect.value;

    generateCover({ title: title, url: url, category: category, language_override: language_override, style_id: selectedStyleId });
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
    errorMessage.textContent = message || 'An unexpected error occurred.';
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

    // Text color based on color_scheme
    var isDark = (data.color_scheme || 'dark').toLowerCase() !== 'light';
    compositorTitleEl.classList.toggle('text-dark', !isDark);
    compositorSubEl.classList.toggle('text-dark', !isDark);

    // Template variant — center-align for template B
    var variant = data.layout_spec && data.layout_spec.template_variant;
    compositorTextEl.classList.toggle('center-align', variant === 'B');

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

  /* ----------------------------------------------------------
     Live Preview Listeners
  ---------------------------------------------------------- */
  function initCompositorListeners() {
    compTitleInput.addEventListener('input', function () {
      compositorTitleEl.textContent = compTitleInput.value;
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

    compositorDlBtn.addEventListener('click', function () {
      var titleSlug = slugify(compTitleInput.value || 'cover');
      downloadComposited(titleSlug);
    });
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
  initCompositorListeners();
  currentState = 'loading'; // trick setState into running for 'form'
  setState('form');

})();
