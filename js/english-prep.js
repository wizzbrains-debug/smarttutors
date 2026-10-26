/**
 * SmartTutors — English Testing Programme (ETP) Client Logic
 * Handles: Form validation · Accessible error states · Cooldown throttling
 *           Apps Script fetch (text/plain + redirect) · Response verification
 */

const ETP_CONFIG = {
  ENDPOINT: 'https://script.google.com/macros/s/AKfycby81IG4QYSUGundZWsvBZFF_jtvpav8YJn1MAO6Bn28IkD7LJLHkRsZX1Xq51OCLTBZtA/exec',
  STORAGE_COOLDOWN_KEY: 'st_etp_last_submit',
  COOLDOWN_DURATION_MS: 5 * 60 * 1000, // 5 minutes
  REQUEST_TIMEOUT_MS: 12000,           // 12 seconds
  ALLOWED_TESTS: ['ielts-academic', 'ielts-general', 'pte-academic', 'sat-rw', 'undecided'],
  ALLOWED_TIMELINES: ['under-1-month', '1-3-months', '3-6-months', 'exploring'],
  ALLOWED_CONTACT: ['whatsapp', 'phone-call', 'email']
};

/* ── Validation Utilities (Exportable for Unit Tests) ── */
const ETPValidator = {
  EMAIL_REGEX: /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+\-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/,

  BLOCKED_DOMAINS: new Set([
    'test.com', 'testing.com', 'example.com', 'sample.com', 'demo.com', 'fake.com',
    'tempmail.com', 'temp-mail.com', 'mailinator.com', 'throwaway.email', 'yopmail.com',
    'sharklasers.com', 'guerrillamail.com', 'trashmail.com', '10minutemail.com'
  ]),

  validateName(raw) {
    const name = String(raw || '').trim();
    if (name.length < 2) return { ok: false, msg: 'Full name must be at least 2 characters.' };
    if (name.length > 80) return { ok: false, msg: 'Full name cannot exceed 80 characters.' };
    return { ok: true, value: name };
  },

  validateEmail(raw) {
    const email = String(raw || '').trim().toLowerCase();
    if (!email) return { ok: false, msg: 'Email address is required.' };
    if (email.length > 254) return { ok: false, msg: 'Email address is too long.' };
    if (!this.EMAIL_REGEX.test(email)) return { ok: false, msg: 'Please enter a valid email address.' };

    const domain = email.split('@')[1];
    if (this.BLOCKED_DOMAINS.has(domain)) {
      return { ok: false, msg: 'Temporary/disposable email addresses are not accepted.' };
    }
    return { ok: true, value: email };
  },

  validatePhone(raw) {
    const stripped = String(raw || '').trim().replace(/[\s\-().+]/g, '');
    if (!stripped) return { ok: false, msg: 'Phone / WhatsApp number is required.' };
    if (!/^\d+$/.test(stripped)) return { ok: false, msg: 'Phone number may only contain digits.' };
    if (stripped.length < 10) return { ok: false, msg: 'Phone number must be at least 10 digits.' };
    if (stripped.length > 15) return { ok: false, msg: 'Phone number cannot exceed 15 digits.' };

    // Reject all-same-digit numbers (e.g. 1111111111)
    if (/^(\d)\1{9,}$/.test(stripped)) {
      return { ok: false, msg: 'Please enter a genuine phone number.' };
    }

    // Common junk sequences
    if (/^(0{7,}|1{7,}|1234567|12345678|123456789|0123456789|1234567890|9876543210)$/.test(stripped)) {
      return { ok: false, msg: 'Please enter a genuine phone number.' };
    }
    return { ok: true, value: stripped };
  },

  validateTestType(raw) {
    const val = String(raw || '').trim().toLowerCase();
    if (!val || !ETP_CONFIG.ALLOWED_TESTS.includes(val)) {
      return { ok: false, msg: 'Please select a valid test program.' };
    }
    return { ok: true, value: val };
  },

  validateTimeline(raw) {
    const val = String(raw || '').trim().toLowerCase();
    if (val && !ETP_CONFIG.ALLOWED_TIMELINES.includes(val)) {
      return { ok: false, msg: 'Please select a valid preparation timeline.' };
    }
    return { ok: true, value: val || 'exploring' };
  },

  validateContactPreference(raw) {
    const val = String(raw || '').trim().toLowerCase();
    if (val && !ETP_CONFIG.ALLOWED_CONTACT.includes(val)) {
      return { ok: false, msg: 'Please select a valid contact method.' };
    }
    return { ok: true, value: val || 'whatsapp' };
  },

  validateConsent(checked) {
    if (checked !== true && checked !== 'true') {
      return { ok: false, msg: 'You must agree to the Privacy Policy to proceed.' };
    }
    return { ok: true };
  }
};

/* ── Client Controller (Browser Only) ── */
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initEtpForm();
    initEtpFaq();
    initCourseButtons();
  });
}

function initEtpForm() {
  const form = document.getElementById('etp-form');
  if (!form) return;

  const submitBtn = document.getElementById('etp-submit-btn');
  const alertEl = document.getElementById('etp-form-alert');
  const cooldownBanner = document.getElementById('etp-cooldown-banner');
  const cooldownTimer = document.getElementById('etp-cooldown-timer');
  const successCard = document.getElementById('etp-success-card');
  const subIdDisplay = document.getElementById('etp-confirmed-sub-id');
  const resetBtn = document.getElementById('etp-reset-btn');

  // Input elements
  const nameInput = document.getElementById('etp-name');
  const emailInput = document.getElementById('etp-email');
  const phoneInput = document.getElementById('etp-phone');
  const testSelect = document.getElementById('etp-test');
  const scoreInput = document.getElementById('etp-score');
  const timelineSelect = document.getElementById('etp-timeline');
  const prefSelect = document.getElementById('etp-pref');
  const notesInput = document.getElementById('etp-notes');
  const consentCheck = document.getElementById('etp-consent');
  const honeypotInput = document.getElementById('etp-website');

  // Clear errors on field interaction
  [nameInput, emailInput, phoneInput, testSelect, timelineSelect, prefSelect, consentCheck].forEach(el => {
    if (!el) return;
    const eventType = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
    el.addEventListener(eventType, () => clearFieldError(el));
  });

  // Check initial cooldown state
  checkCooldown();

  // Form submit event
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    // 1. Cooldown check
    if (isCooldownActive()) {
      showCooldownBanner();
      return;
    }

    // 2. Validate all fields
    const validation = validateAllFields();
    if (!validation.isValid) {
      if (validation.firstInvalidEl) {
        validation.firstInvalidEl.focus();
      }
      return;
    }

    const payload = validation.payload;

    // 3. Honeypot bot protection
    if (honeypotInput && honeypotInput.value.trim() !== '') {
      console.warn('[ETP Client] Honeypot triggered. Silent simulation.');
      setLoading(true);
      await new Promise(r => setTimeout(r, 1000));
      setLoading(false);
      showSuccess('etp_bot_discarded');
      return;
    }

    // 4. In-flight locking
    setLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ETP_CONFIG.REQUEST_TIMEOUT_MS);

      const response = await fetch(ETP_CONFIG.ENDPOINT, {
        method: 'POST',
        headers: {
          // Use text/plain to avoid CORS preflight rejection by Apps Script edge
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok && response.status !== 0) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const result = await response.json();

      // 5. Strict Response Verification
      if (result && result.status === 'success' && result.id) {
        // Stamp cooldown on successful submission
        setCooldown();
        showSuccess(result.id, result.duplicate);
      } else {
        const errorMsg = (result && result.message) ? result.message : 'Unable to verify submission. Please try again.';
        showAlert(errorMsg, 'error');
      }
    } catch (err) {
      console.error('[ETP Client] Network error:', err);
      let userMsg = 'We could not submit your inquiry due to a network connection issue. Your details have been preserved. Please try again, or contact us directly on WhatsApp.';
      if (err.name === 'AbortError') {
        userMsg = 'The request timed out. Please check your connection and retry, or reach out directly on WhatsApp.';
      }
      showAlert(userMsg, 'error');
    } finally {
      setLoading(false);
    }
  });

  // "Submit another inquiry" button
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      form.reset();
      form.style.display = 'block';
      successCard.classList.remove('visible');
      hideAlert();
      clearCooldown();
      checkCooldown();
      nameInput.focus();
    });
  }

  /* ── Helper Functions ── */
  function validateAllFields() {
    let isValid = true;
    let firstInvalidEl = null;

    const nameRes = ETPValidator.validateName(nameInput?.value);
    if (!nameRes.ok) {
      setFieldError(nameInput, nameRes.msg);
      isValid = false;
      if (!firstInvalidEl) firstInvalidEl = nameInput;
    }

    const emailRes = ETPValidator.validateEmail(emailInput?.value);
    if (!emailRes.ok) {
      setFieldError(emailInput, emailRes.msg);
      isValid = false;
      if (!firstInvalidEl) firstInvalidEl = emailInput;
    }

    const phoneRes = ETPValidator.validatePhone(phoneInput?.value);
    if (!phoneRes.ok) {
      setFieldError(phoneInput, phoneRes.msg);
      isValid = false;
      if (!firstInvalidEl) firstInvalidEl = phoneInput;
    }

    const testRes = ETPValidator.validateTestType(testSelect?.value);
    if (!testRes.ok) {
      setFieldError(testSelect, testRes.msg);
      isValid = false;
      if (!firstInvalidEl) firstInvalidEl = testSelect;
    }

    const timeRes = ETPValidator.validateTimeline(timelineSelect?.value);
    if (!timeRes.ok) {
      setFieldError(timelineSelect, timeRes.msg);
      isValid = false;
      if (!firstInvalidEl) firstInvalidEl = timelineSelect;
    }

    const prefRes = ETPValidator.validateContactPreference(prefSelect?.value);
    if (!prefRes.ok) {
      setFieldError(prefSelect, prefRes.msg);
      isValid = false;
      if (!firstInvalidEl) firstInvalidEl = prefSelect;
    }

    const consentRes = ETPValidator.validateConsent(consentCheck?.checked);
    if (!consentRes.ok) {
      setFieldError(consentCheck, consentRes.msg);
      isValid = false;
      if (!firstInvalidEl) firstInvalidEl = consentCheck;
    }

    const payload = {
      full_name: nameRes.value || '',
      email: emailRes.value || '',
      phone: phoneRes.value || '',
      target_test: testRes.value || '',
      target_score: String(scoreInput?.value || '').trim().slice(0, 40),
      prep_timeline: timeRes.value || 'exploring',
      contact_preference: prefRes.value || 'whatsapp',
      questions_notes: String(notesInput?.value || '').trim().slice(0, 500),
      privacy_consent: true,
      website_url: String(honeypotInput?.value || '').trim()
    };

    return { isValid, firstInvalidEl, payload };
  }

  function setFieldError(el, message) {
    if (!el) return;
    el.classList.add('error');
    el.setAttribute('aria-invalid', 'true');
    const errContainer = document.getElementById(`${el.id}-error`);
    if (errContainer) {
      errContainer.textContent = message;
    }
  }

  function clearFieldError(el) {
    if (!el) return;
    el.classList.remove('error');
    el.removeAttribute('aria-invalid');
    const errContainer = document.getElementById(`${el.id}-error`);
    if (errContainer) {
      errContainer.textContent = '';
    }
  }

  function showAlert(msg, type = 'error') {
    if (!alertEl) return;
    alertEl.textContent = msg;
    alertEl.className = `etp-alert ${type}`;
    alertEl.style.display = 'block';
    alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideAlert() {
    if (!alertEl) return;
    alertEl.style.display = 'none';
  }

  function setLoading(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    submitBtn.classList.toggle('loading', loading);
  }

  function showSuccess(subId, isDuplicate = false) {
    form.style.display = 'none';
    if (successCard) {
      successCard.classList.add('visible');
    }
    if (subIdDisplay) {
      subIdDisplay.textContent = `Reference ID: ${subId}`;
    }
    const noteEl = document.getElementById('etp-duplicate-note');
    if (noteEl) {
      noteEl.style.display = isDuplicate ? 'block' : 'none';
    }
    successCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* Cooldown management */
  function isCooldownActive() {
    const ts = parseInt(localStorage.getItem(ETP_CONFIG.STORAGE_COOLDOWN_KEY) || '0', 10);
    return ts && (Date.now() - ts < ETP_CONFIG.COOLDOWN_DURATION_MS);
  }

  function setCooldown() {
    localStorage.setItem(ETP_CONFIG.STORAGE_COOLDOWN_KEY, Date.now().toString());
  }

  function clearCooldown() {
    localStorage.removeItem(ETP_CONFIG.STORAGE_COOLDOWN_KEY);
  }

  function checkCooldown() {
    if (isCooldownActive()) {
      showCooldownBanner();
    }
  }

  function showCooldownBanner() {
    if (!cooldownBanner) return;
    cooldownBanner.classList.add('visible');
    if (submitBtn) submitBtn.disabled = true;

    function update() {
      const ts = parseInt(localStorage.getItem(ETP_CONFIG.STORAGE_COOLDOWN_KEY) || '0', 10);
      const remaining = ETP_CONFIG.COOLDOWN_DURATION_MS - (Date.now() - ts);
      if (remaining <= 0) {
        cooldownBanner.classList.remove('visible');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      if (cooldownTimer) {
        cooldownTimer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
      setTimeout(update, 1000);
    }
    update();
  }
}

/* ── FAQ Accordion ── */
function initEtpFaq() {
  const triggers = document.querySelectorAll('.etp-faq-trigger');
  triggers.forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.etp-faq-item');
      if (!item) return;
      const isOpen = item.classList.contains('open');
      // Close other accordion items
      document.querySelectorAll('.etp-faq-item.open').forEach(el => {
        if (el !== item) {
          el.classList.remove('open');
          const t = el.querySelector('.etp-faq-trigger');
          if (t) t.setAttribute('aria-expanded', 'false');
        }
      });
      item.classList.toggle('open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });
}

/* ── Course Track CTA Pre-selection ── */
function initCourseButtons() {
  document.querySelectorAll('[data-etp-select]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetTest = btn.getAttribute('data-etp-select');
      const selectEl = document.getElementById('etp-test');
      if (selectEl && targetTest) {
        selectEl.value = targetTest;
      }
      const formSection = document.getElementById('enquire');
      if (formSection) {
        formSection.scrollIntoView({ behavior: 'smooth' });
        const nameInput = document.getElementById('etp-name');
        if (nameInput) setTimeout(() => nameInput.focus(), 500);
      }
    });
  });
}

/* Export for Node.js test environment */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ETP_CONFIG, ETPValidator };
}
