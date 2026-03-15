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
     State
  ---------------------------------------------------------- */
  var currentState   = 'form';
  var loadingTimerId = null;
  var toastTimerId   = null;
  var msgIndex       = 0;

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

    generateCover({ title: title, url: url, category: category, language_override: language_override });
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
     Init — form section is active by default via HTML class,
     call setState to register currentState correctly.
  ---------------------------------------------------------- */
  currentState = 'loading'; // trick setState into running for 'form'
  setState('form');

})();
