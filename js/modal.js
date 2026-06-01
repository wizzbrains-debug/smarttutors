/**
 * SmartTutors — Enrollment Modal JS
 * Premium glassmorphic form with success animation & confetti
 * Security: honeypot · rate-limit · email blocklist · phone rules
 * Integration: Google Sheets via Apps Script Web App
 */

/* ════════════════════════════════════════════
   GOOGLE SHEETS INTEGRATION
   Replace the placeholder URL below with your
   deployed Google Apps Script Web App URL.
   Instructions: Extensions → Apps Script → Deploy → Web App
   ════════════════════════════════════════════ */
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxIJrBOOCUNzRiKnHq5L_qnAX55RdzSf0Px7yxA9jrm0Jwcydhh2kia-PehvsZ3Q0gz/exec';

/* ════════════════════════════════════════════
   ENROLL STORE — shared localStorage module
   ════════════════════════════════════════════ */
const EnrollStore = (() => {
  const STORAGE_KEY = 'st_enrollments';

  const LEVEL_LABELS = {
    'o-level': 'Cambridge O Level / IGCSE',
    'a-level': 'Cambridge International AS & A Level',
  };

  const SUBJECT_LABELS = {
    'english':             'English Language',
    'mathematics':         'Mathematics',
    'physics':             'Physics',
    'chemistry':           'Chemistry',
    'biology':             'Biology',
    'cs':                  'Computer Science',
    'it':                  'Information Technology',
    'economics':           'Economics',
    'business':            'Business Studies',
    'accounting':          'Accounting',
    'pakistan-studies':    'Pakistan Studies',
    'islamiyat':           'Islamiyat',
    'global-perspectives': 'Global Perspectives',
  };

  function getAll() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  }

  function save(data) {
    const enrollments = getAll();
    const record = {
      id:            Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      submittedAt:   new Date().toISOString(),
      name:          data.name,
      email:         data.email,
      phone:         data.phone,
      level:         data.level,
      levelLabel:    LEVEL_LABELS[data.level] || data.level,
      subjects:      data.subjects,
      subjectLabels: data.subjects.map(s => SUBJECT_LABELS[s] || s),
    };
    enrollments.unshift(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enrollments));
    console.debug('[SmartTutors] Enrollment saved:', record);
    return record;
  }

  function remove(id) {
    const filtered = getAll().filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }

  function clear() { localStorage.removeItem(STORAGE_KEY); }

  return { getAll, save, remove, clear, LEVEL_LABELS, SUBJECT_LABELS };
})();


/* ════════════════════════════════════════════
   SECURITY LAYER
   ════════════════════════════════════════════ */
const EnrollSecurity = (() => {

  /* ── 1. Email Validation ── */

  // Blocked domains: disposable, test, obviously fake
  const BLOCKED_DOMAINS = new Set([
    'test.com','testing.com','example.com','sample.com','demo.com','fake.com',
    'abc.com','xyz.com','aaa.com','bbb.com','ccc.com','asdf.com','qwerty.com',
    'tempmail.com','temp-mail.com','tempmail.net','tempmail.org',
    'mailinator.com','guerrillamail.com','guerrillamail.net','guerrillamail.org',
    'sharklasers.com','guerrillamailblock.com','grr.la','guerrillamail.info',
    'throwam.com','throwaway.email','dispostable.com','yopmail.com',
    'yopmail.fr','cool.fr.nf','jetable.fr.nf','nospam.ze.tc','nomail.xl.cx',
    'maileater.com','mailnull.com','spamgourmet.com','spamgourmet.net',
    'spamgourmet.org','trashmail.at','trashmail.io','trashmail.me',
    'trashmail.net','trashmail.org','trashmail.xyz','fakeinbox.com',
    'maildrop.cc','discard.email','spamspot.com','spam4.me','spaml.de',
    'mailnew.com','spambog.com','spambog.de','spambog.ru','0815.ru',
    'getonemail.com','filzmail.com','armyspy.com','cuvox.de','dayrep.com',
    'einrot.com','fleckens.hu','gustr.com','jourrapide.com','rhyta.com',
    'superrito.com','teleworm.us','antichef.com','antichef.net','courriel.fr.nf',
    'mytemp.email','tempr.email','discard.email','nomail.in',
    'nobody.dude','nowhere.com','invalid.com','noemail.com','no-reply.com',
  ]);

  // Allowed TLDs — must end in a legit extension
  const VALID_TLD = /\.(com|net|org|edu|gov|mil|co|io|pk|uk|us|ae|sa|bd|in|de|fr|au|ca|nz|sg|my|biz|info|pro|int|arpa|jobs|mobi|tel|travel|name|museum|coop|aero|xxx|ly|cc|tv|me|app|dev|ai|tech|academy|school|institute|college|university)(\.[a-z]{2})?$/i;

  // Strict email structure regex
  const EMAIL_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+\-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

  function validateEmail(raw) {
    const email = (raw || '').trim().toLowerCase();
    if (!email) return { ok: false, msg: 'Email address is required.' };
    if (!EMAIL_REGEX.test(email)) return { ok: false, msg: 'Please enter a valid email address.' };

    const domain = email.split('@')[1];
    if (BLOCKED_DOMAINS.has(domain)) return { ok: false, msg: 'Please use a real email address — temporary/test domains are not accepted.' };
    if (!VALID_TLD.test(domain)) return { ok: false, msg: 'Email domain doesn\'t appear to be valid. Please use a real address.' };

    // Reject suspiciously short username (e.g. a@b.com)
    const username = email.split('@')[0];
    if (username.length < 2) return { ok: false, msg: 'Please enter a valid email address.' };

    return { ok: true };
  }

  /* ── 2. Phone Validation ── */

  function sanitizePhone(raw) {
    // Strip all spaces, dashes, parentheses, dots
    return (raw || '').replace(/[\s\-().+]/g, '');
  }

  // Known sequential/ascending junk patterns
  const JUNK_SEQUENCES = /^(0{7,}|1{7,}|1234567|12345678|123456789|0123456789|9876543210)$/;

  function validatePhone(raw) {
    const stripped = sanitizePhone(raw);

    // Only digits after stripping
    if (!/^\d+$/.test(stripped)) return { ok: false, msg: 'Phone number may only contain digits, spaces, or dashes.' };

    const len = stripped.length;

    // Global min/max digit count
    if (len < 10) return { ok: false, msg: 'Phone number too short — must be at least 10 digits.' };
    if (len > 15) return { ok: false, msg: 'Phone number too long — maximum 15 digits allowed.' };

    // Reject junk sequences
    if (JUNK_SEQUENCES.test(stripped)) return { ok: false, msg: 'Please enter a real mobile number.' };

    // Reject all-same-digit numbers (e.g. 1111111111)
    if (/^(\d)\1{9,}$/.test(stripped)) return { ok: false, msg: 'Please enter a real mobile number.' };

    // Pakistan-specific prefix rules
    // Entered as 03XX-XXXXXXX  → 11 stripped digits starting with 03
    if (stripped.startsWith('03') && len !== 11) {
      return { ok: false, msg: 'Pakistani numbers starting with 03 must be exactly 11 digits (e.g. 03001234567).' };
    }
    // Entered as 923XX-XXXXXXX → 12 stripped digits starting with 923
    if (stripped.startsWith('923') && !(len === 12 || len === 13)) {
      return { ok: false, msg: 'Pakistani numbers starting with 923 must be 12–13 digits total.' };
    }
    // Entered as 9230 (if they typed country code separately) — reject numbers starting with 0 after stripping a 92 prefix
    if (stripped.startsWith('920')) {
      return { ok: false, msg: 'Invalid Pakistani number — did you mean 923XX...?' };
    }

    return { ok: true, sanitized: stripped };
  }

  /* ── 3. Rate Limiting / Cooldown ── */

  const RATE_KEY     = 'st_last_submit';
  const COOLDOWN_MS  = 10 * 60 * 1000; // 10 minutes

  function getCooldownState() {
    try {
      const ts = parseInt(localStorage.getItem(RATE_KEY) || '0', 10);
      const elapsed = Date.now() - ts;
      if (!ts || elapsed >= COOLDOWN_MS) return { blocked: false };
      const remainMs = COOLDOWN_MS - elapsed;
      const mins = Math.ceil(remainMs / 60000);
      const secs = Math.ceil((remainMs % 60000) / 1000);
      return { blocked: true, remainMs, mins, secs };
    } catch { return { blocked: false }; }
  }

  function stampCooldown() {
    localStorage.setItem(RATE_KEY, Date.now().toString());
  }

  function clearCooldown() {
    localStorage.removeItem(RATE_KEY);
  }

  /* ── 4. Honeypot Check ── */

  function isBot(formEl) {
    const hp = formEl?.querySelector('[name="website_url"]');
    return hp && hp.value.trim() !== '';
  }

  return { validateEmail, validatePhone, sanitizePhone, getCooldownState, stampCooldown, clearCooldown, isBot };
})();


/* ════════════════════════════════════════════
   ENROLL MODAL
   ════════════════════════════════════════════ */
const EnrollModal = (() => {
  /* ── Element Refs ── */
  const modal           = document.getElementById('enroll-modal');
  const backdrop        = document.getElementById('enroll-backdrop');
  const closeBtn        = document.getElementById('enroll-close-btn');
  const form            = document.getElementById('enroll-form');
  const submitBtn       = document.getElementById('enroll-submit');
  const successCloseBtn = document.getElementById('enroll-success-close');
  const cooldownBanner  = document.getElementById('enroll-cooldown-banner');
  const cooldownTimer   = document.getElementById('enroll-cooldown-timer');
  if (!modal) return {};

  let cooldownInterval = null;

  /* ── Cooldown Banner ── */
  function showCooldownBanner() {
    if (!cooldownBanner) return;

    function tick() {
      const state = EnrollSecurity.getCooldownState();
      if (!state.blocked) {
        hideCooldownBanner();
        return;
      }
      const m = String(state.mins).padStart(2, '0');
      const s = String(state.secs).padStart(2, '0');
      if (cooldownTimer) cooldownTimer.textContent = `${m}:${s}`;
    }

    cooldownBanner.hidden = false;
    requestAnimationFrame(() => { requestAnimationFrame(() => { cooldownBanner.classList.add('visible'); }); });

    // Disable submit
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('rate-limited');
    }

    tick();
    clearInterval(cooldownInterval);
    cooldownInterval = setInterval(tick, 1000);
  }

  function hideCooldownBanner() {
    clearInterval(cooldownInterval);
    if (!cooldownBanner) return;
    cooldownBanner.classList.remove('visible');
    cooldownBanner.addEventListener('transitionend', () => {
      cooldownBanner.hidden = true;
    }, { once: true });
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('rate-limited');
    }
  }

  /* ── Open ── */
  function open(triggerLabel = '') {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { modal.classList.add('open'); });
    });

    // Check cooldown immediately on open
    const state = EnrollSecurity.getCooldownState();
    if (state.blocked) showCooldownBanner();

    if (triggerLabel) {
      console.debug('[SmartTutors] Modal opened via:', triggerLabel);
      if (typeof trackEvent === 'function') trackEvent('enroll_modal_open', { trigger: triggerLabel });
    }

    setTimeout(() => {
      const first = modal.querySelector('.enroll-input:not([name="website_url"]), .enroll-select');
      first?.focus();
    }, 440);
  }

  /* ── Close ── */
  function close() {
    clearInterval(cooldownInterval);
    modal.classList.remove('open', 'success-state');
    document.body.style.overflow = '';
    modal.addEventListener('transitionend', () => {
      modal.hidden = true;
      resetForm();
    }, { once: true });
  }

  /* ── Reset ── */
  function resetForm() {
    form?.reset();
    if (submitBtn) {
      submitBtn.classList.remove('loading', 'rate-limited');
      // Re-enable only if not in cooldown
      submitBtn.disabled = EnrollSecurity.getCooldownState().blocked;
    }
    modal.querySelectorAll('.enroll-input.error, .enroll-select.error').forEach(el => el.classList.remove('error'));
    clearFieldError(document.getElementById('enroll-email'));
    clearFieldError(document.getElementById('enroll-phone'));
  }

  /* ── Close Triggers ── */
  closeBtn?.addEventListener('click', close);
  successCloseBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  /* ── Wire all CTA buttons ── */
  function wireButtons() {
    document.querySelectorAll('.program-cta, #cta-btn, .mobile-cta').forEach(btn => {
      btn.addEventListener('click', (e) => { e.preventDefault(); open(btn.textContent.trim()); });
    });

    const conditional = ['.hero-ctas .cta-btn', '.about-cta-btns .cta-btn', '.stories-cta-row .cta-btn'];
    const sectionAnchors = ['#programs', '#stories', '#about', '#subjects', '#home', '#contact'];

    conditional.forEach(sel => {
      document.querySelectorAll(sel).forEach(btn => {
        const href = btn.getAttribute('href');
        if (href && href !== '#' && !sectionAnchors.includes(href)) return;
        btn.addEventListener('click', (e) => {
          if (!btn.getAttribute('href') || btn.getAttribute('href') === '#') {
            e.preventDefault();
            open(btn.textContent.trim());
          }
        });
      });
    });
  }

  /* ── Field Error Helpers ── */
  function setFieldError(el, msg) {
    if (!el) return;
    el.classList.add('error');

    // Show inline error message
    let errEl = el.parentElement?.querySelector('.enroll-field-error');
    if (!errEl) {
      errEl = document.createElement('span');
      errEl.className = 'enroll-field-error';
      errEl.setAttribute('role', 'alert');
      el.parentElement?.appendChild(errEl);
    }
    errEl.textContent = msg;

    el.addEventListener('input', () => clearFieldError(el), { once: true });
  }

  function clearFieldError(el) {
    if (!el) return;
    el.classList.remove('error');
    const errEl = el.parentElement?.querySelector('.enroll-field-error');
    if (errEl) errEl.remove();
  }

  function shake(el) {
    if (!el) return;
    el.animate([
      { transform: 'translateX(0)' },
      { transform: 'translateX(-7px)' },
      { transform: 'translateX(7px)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(0)' },
    ], { duration: 380, easing: 'ease-out' });
  }

  /* ── Phone: live auto-sanitize on input ── */
  const phoneEl = document.getElementById('enroll-phone');
  phoneEl?.addEventListener('input', () => {
    // Allow only digits, spaces, dashes, parens, +
    phoneEl.value = phoneEl.value.replace(/[^\d\s\-().+]/g, '');
    clearFieldError(phoneEl);
  });

  /* ── Validate ── */
  function validate() {
    let valid = true;

    // Name
    const nameEl = document.getElementById('enroll-name');
    if (!nameEl?.value.trim() || nameEl.value.trim().length < 2) {
      setFieldError(nameEl, 'Please enter the student\'s full name.');
      shake(nameEl);
      valid = false;
    } else { clearFieldError(nameEl); }

    // Email — advanced validation
    const emailEl = document.getElementById('enroll-email');
    const emailResult = EnrollSecurity.validateEmail(emailEl?.value);
    if (!emailResult.ok) {
      setFieldError(emailEl, emailResult.msg);
      shake(emailEl);
      valid = false;
    } else { clearFieldError(emailEl); }

    // Phone — advanced validation
    const phoneResult = EnrollSecurity.validatePhone(phoneEl?.value);
    if (!phoneResult.ok) {
      setFieldError(phoneEl, phoneResult.msg);
      shake(phoneEl);
      valid = false;
    } else { clearFieldError(phoneEl); }

    // Level
    const levelEl = document.getElementById('enroll-level');
    if (!levelEl?.value) {
      setFieldError(levelEl, 'Please select a qualification level.');
      shake(levelEl);
      valid = false;
    } else { clearFieldError(levelEl); }

    // At least one subject
    const checked = modal.querySelectorAll('.enroll-subject-check:checked');
    if (checked.length === 0) {
      const sec = document.getElementById('enroll-subjects-section');
      if (sec) {
        sec.style.outline      = '2px solid rgba(239,68,68,0.5)';
        sec.style.borderRadius = '12px';
        setTimeout(() => { sec.style.outline = ''; }, 2400);
      }
      valid = false;
    }

    return valid;
  }

  /* ── Confetti ── */
  function launchConfetti() {
    const container = document.getElementById('enroll-confetti');
    if (!container) return;
    container.innerHTML = '';
    const colors = ['#7C3AED', '#A855F7', '#FF6B6B', '#FF8E8E', '#F59E0B', '#10B981', '#3B82F6'];
    for (let i = 0; i < 36; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      const size = 6 + Math.random() * 8;
      p.style.cssText = `
        width:${size}px; height:${size * (0.4 + Math.random() * 0.8)}px;
        left:${10 + Math.random() * 80}%;
        background:${colors[Math.floor(Math.random() * colors.length)]};
        border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
        animation-duration:${1.2 + Math.random() * 0.8}s;
        animation-delay:${Math.random() * 0.5}s;
      `;
      container.appendChild(p);
    }
  }

  /* ── Submit ── */
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    /* — Rate limit check — */
    const rateState = EnrollSecurity.getCooldownState();
    if (rateState.blocked) {
      showCooldownBanner();
      return;
    }

    /* — Validation — */
    if (!validate()) return;

    /* — Honeypot check — */
    const isBot = EnrollSecurity.isBot(form);

    /* — Loading state — */
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');

    const formData = {
      name:     document.getElementById('enroll-name')?.value.trim(),
      email:    document.getElementById('enroll-email')?.value.trim().toLowerCase(),
      phone:    EnrollSecurity.sanitizePhone(phoneEl?.value || ''),
      level:    document.getElementById('enroll-level')?.value,
      subjects: [...modal.querySelectorAll('.enroll-subject-check:checked')].map(c => c.value),
    };

    // Simulate minimum processing time regardless of bot status
    // (Never reveal real vs. fake result timing to bots)
    const minDelay = new Promise(resolve => setTimeout(resolve, 1000));

    if (!isBot) {
      // ── Step 1: Save to localStorage immediately (offline-safe backup) ──
      const record = EnrollStore.save(formData);

      // ── Step 2: POST to Google Sheets via Apps Script ──
      if (GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_URL !== 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
        const payload = {
          name:         formData.name,
          email:        formData.email,
          phone:        formData.phone,
          level:        formData.level,
          levelLabel:   EnrollStore.LEVEL_LABELS[formData.level] || formData.level,
          subjects:     formData.subjects.join(', '),
          subjectLabels: formData.subjects
                          .map(s => EnrollStore.SUBJECT_LABELS[s] || s)
                          .join(', '),
          submittedAt:  record.submittedAt,
          id:           record.id,
        };

        // Fire-and-forget with timeout — never block the UX on network issues
        const controller = new AbortController();
        const networkTimeout = setTimeout(() => controller.abort(), 8000);

        fetch(GOOGLE_SCRIPT_URL, {
          method:  'POST',
          // no-cors mode required for Apps Script to avoid preflight CORS errors
          mode:    'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
          signal:  controller.signal,
        })
          .then(() => {
            clearTimeout(networkTimeout);
            console.debug('[SmartTutors] ✅ Google Sheets POST succeeded.');
          })
          .catch(err => {
            clearTimeout(networkTimeout);
            // Network failure is silent — localStorage already has the record
            console.warn('[SmartTutors] ⚠️ Google Sheets POST failed (localStorage backup retained):', err.message);
          });
      } else {
        console.debug('[SmartTutors] Google Sheets URL not configured — localStorage only.');
      }

      // ── Step 3: Stamp cooldown & fire analytics ──
      EnrollSecurity.stampCooldown();

      if (typeof trackEvent === 'function') {
        trackEvent('enroll_form_submit', {
          level: formData.level,
          subject_count: formData.subjects.length,
        });
      }
    } else {
      // Silent bot discard — do NOT save, do NOT stamp rate limit, do NOT POST
      console.debug('[SmartTutors Security] Honeypot triggered — submission discarded silently.');
    }

    // Wait for minimum delay to complete (UX polish)
    await minDelay;

    // Show success UI regardless (bots get fake success too)
    modal.classList.add('success-state');
    launchConfetti();
    const nameDisplay = document.getElementById('success-student-name');
    if (nameDisplay) nameDisplay.textContent = formData.name.split(' ')[0];
  });

  /* ── Init ── */
  wireButtons();

  return { open, close };
})();
