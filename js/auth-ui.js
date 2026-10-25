/**
 * SmartTutors — Authentication & Student Account UI (Phase 2)
 * Renders glassmorphic Auth Modal, Navbar Status Pills, and Student Account Drawer.
 */
(function (window, document) {
  'use strict';

  const Auth = window.SmartTutorsAuth;
  if (!Auth) return;

  /* ── Styles Injection for Auth Components ── */
  function injectAuthStyles() {
    if (document.getElementById('st-auth-styles')) return;
    const style = document.createElement('style');
    style.id = 'st-auth-styles';
    style.textContent = `
      .st-auth-backdrop {
        position: fixed; inset: 0; z-index: 99998;
        background: rgba(10, 15, 30, 0.72);
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        display: flex; align-items: center; justify-content: center;
        padding: 16px; opacity: 0; pointer-events: none;
        transition: opacity 250ms ease;
      }
      .st-auth-backdrop.st-active {
        opacity: 1; pointer-events: auto;
      }
      .st-auth-card {
        background: #ffffff;
        color: #0f172a;
        width: 100%; max-width: 440px;
        border-radius: 24px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(226, 232, 240, 0.8);
        overflow: hidden;
        transform: translateY(16px) scale(0.97);
        transition: transform 250ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      .dark .st-auth-card {
        background: #0b1120;
        color: #f8fafc;
        border-color: rgba(255, 255, 255, 0.1);
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
      }
      .st-auth-backdrop.st-active .st-auth-card {
        transform: translateY(0) scale(1);
      }
      .st-auth-header {
        padding: 24px 28px 16px;
        position: relative;
        border-bottom: 1px solid #f1f5f9;
      }
      .dark .st-auth-header { border-bottom-color: rgba(255, 255, 255, 0.08); }
      .st-auth-close {
        position: absolute; top: 20px; right: 20px;
        width: 32px; height: 32px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        background: #f1f5f9; border: none; cursor: pointer; color: #64748b;
        transition: all 150ms;
      }
      .dark .st-auth-close { background: #1e293b; color: #94a3b8; }
      .st-auth-close:hover { background: #e2e8f0; color: #0f172a; }
      .dark .st-auth-close:hover { background: #334155; color: #fff; }
      .st-auth-tabs {
        display: flex; gap: 8px; margin-top: 12px;
        background: #f1f5f9; padding: 4px; border-radius: 12px;
      }
      .dark .st-auth-tabs { background: #1e293b; }
      .st-auth-tab {
        flex: 1; padding: 8px 12px; font-size: 14px; font-weight: 600;
        border: none; border-radius: 8px; background: transparent;
        color: #64748b; cursor: pointer; transition: all 150ms;
      }
      .dark .st-auth-tab { color: #94a3b8; }
      .st-auth-tab.active {
        background: #fff; color: #7c3aed;
        box-shadow: 0 2px 4px rgba(0,0,0,0.06);
      }
      .dark .st-auth-tab.active { background: #0f172a; color: #a78bfa; }
      .st-auth-body { padding: 24px 28px 28px; max-height: 80vh; overflow-y: auto; }
      .st-auth-form { display: flex; flex-direction: column; gap: 14px; }
      .st-auth-field { display: flex; flex-direction: column; gap: 6px; }
      .st-auth-field label { font-size: 13px; font-weight: 600; color: #334155; }
      .dark .st-auth-field label { color: #cbd5e1; }
      .st-auth-input, .st-auth-select {
        width: 100%; padding: 10px 14px; border-radius: 10px; font-size: 14px;
        border: 1px solid #cbd5e1; background: #fff; color: #0f172a;
        outline: none; transition: border-color 150ms;
      }
      .dark .st-auth-input, .dark .st-auth-select {
        background: #1e293b; border-color: #334155; color: #f8fafc;
      }
      .st-auth-input:focus, .st-auth-select:focus { border-color: #7c3aed; }
      .st-auth-checkbox-label {
        display: flex; align-items: flex-start; gap: 10px; font-size: 13px;
        line-height: 1.4; color: #475569; cursor: pointer; margin-top: 4px;
      }
      .dark .st-auth-checkbox-label { color: #94a3b8; }
      .st-auth-checkbox-label input { margin-top: 3px; accent-color: #7c3aed; }
      .st-auth-submit-btn {
        margin-top: 8px; width: 100%; padding: 12px;
        background: linear-gradient(135deg, #7c3aed, #ff6b6b);
        color: #fff; border: none; border-radius: 12px;
        font-size: 15px; font-weight: 600; cursor: pointer;
        box-shadow: 0 4px 12px rgba(124, 58, 237, 0.25);
        transition: transform 150ms, box-shadow 150ms;
      }
      .st-auth-submit-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(124, 58, 237, 0.35);
      }
      .st-auth-submit-btn:disabled {
        opacity: 0.6; cursor: not-allowed; transform: none;
      }
      .st-auth-alert {
        padding: 10px 14px; border-radius: 10px; font-size: 13px; line-height: 1.4;
        display: none; margin-bottom: 12px;
      }
      .st-auth-alert.error {
        display: block; background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
      }
      .dark .st-auth-alert.error { background: #450a0a; border-color: #7f1d1d; color: #fca5a5; }
      .st-auth-alert.success {
        display: block; background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d;
      }
      .dark .st-auth-alert.success { background: #052e16; border-color: #14532d; color: #86efac; }
      .st-auth-alert.warning {
        display: block; background: #fffbeb; border: 1px solid #fde68a; color: #b45309;
      }
      .dark .st-auth-alert.warning { background: #451a03; border-color: #78350f; color: #fde68a; }
      .st-nav-auth-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 7px 14px; font-size: 13px; font-weight: 600;
        border-radius: 9999px; border: 1px solid rgba(124, 58, 237, 0.3);
        background: rgba(124, 58, 237, 0.08); color: #7c3aed;
        cursor: pointer; transition: all 150ms; text-decoration: none;
      }
      .dark .st-nav-auth-btn {
        border-color: rgba(167, 139, 250, 0.3);
        background: rgba(167, 139, 250, 0.12); color: #c4b5fd;
      }
      .st-nav-auth-btn:hover {
        background: #7c3aed; color: #fff;
      }
      .st-account-pill {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 5px 12px; border-radius: 9999px;
        background: #f1f5f9; border: 1px solid #e2e8f0;
        cursor: pointer; font-size: 13px; font-weight: 600;
      }
      .dark .st-account-pill {
        background: #1e293b; border-color: #334155; color: #f8fafc;
      }
      .st-avatar-dot {
        width: 22px; height: 22px; border-radius: 50%;
        background: linear-gradient(135deg, #7c3aed, #ff6b6b);
        color: #fff; display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 700;
      }
    `;
    document.head.appendChild(style);
  }

  /* ── Modal DOM Template ── */
  let modalBackdrop = null;
  let activeTab = 'signin';
  let hasPromptedTermsThisSession = false;

  function createAuthModal() {
    if (modalBackdrop) return;
    injectAuthStyles();

    modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'st-auth-backdrop';
    modalBackdrop.id = 'st-auth-modal';
    modalBackdrop.innerHTML = `
      <div class="st-auth-card" role="dialog" aria-modal="true" aria-labelledby="st-auth-title">
        <div class="st-auth-header">
          <button class="st-auth-close" id="st-auth-close-btn" aria-label="Close modal">&times;</button>
          <h2 id="st-auth-title" style="font-size: 20px; font-weight: 700; margin: 0;">Student Portal</h2>
          <p id="st-auth-subtitle" style="font-size: 13px; color: #64748b; margin: 4px 0 0;">Access Cambridge Socratic AI Tutoring</p>
          <div class="st-auth-tabs">
            <button class="st-auth-tab active" id="st-tab-signin">Sign In</button>
            <button class="st-auth-tab" id="st-tab-signup">Create Account</button>
          </div>
        </div>
        <div class="st-auth-body">
          <div id="st-auth-alert" class="st-auth-alert"></div>

          <!-- SIGN IN FORM -->
          <form id="st-signin-form" class="st-auth-form">
            <div class="st-auth-field">
              <label for="st-in-email">Email Address</label>
              <input type="email" id="st-in-email" class="st-auth-input" required autocomplete="email" placeholder="student@example.com">
            </div>
            <div class="st-auth-field">
              <label for="st-in-password">Password</label>
              <input type="password" id="st-in-password" class="st-auth-input" required autocomplete="current-password" placeholder="••••••••">
            </div>
            <button type="submit" class="st-auth-submit-btn" id="st-btn-signin">Sign In</button>
          </form>

          <!-- SIGN UP FORM -->
          <form id="st-signup-form" class="st-auth-form" style="display: none;">
            <div class="st-auth-field">
              <label for="st-up-name">Full Name</label>
              <input type="text" id="st-up-name" class="st-auth-input" required autocomplete="name" placeholder="Alice Smith">
            </div>
            <div class="st-auth-field">
              <label for="st-up-email">Email Address</label>
              <input type="email" id="st-up-email" class="st-auth-input" required autocomplete="email" placeholder="student@example.com">
            </div>
            <div class="st-auth-field">
              <label for="st-up-password">Password (min 8 chars)</label>
              <input type="password" id="st-up-password" class="st-auth-input" minlength="8" required autocomplete="new-password" placeholder="••••••••">
            </div>
            <div class="st-auth-field">
              <label for="st-up-qual">Qualification Track</label>
              <select id="st-up-qual" class="st-auth-select" required>
                <option value="o-level">Cambridge O Level / IGCSE</option>
                <option value="a-level">Cambridge International AS & A Level</option>
              </select>
            </div>
            <div class="st-auth-field">
              <label for="st-up-mobile">Mobile Number (Optional)</label>
              <input type="tel" id="st-up-mobile" class="st-auth-input" autocomplete="tel" placeholder="+92 300 1234567">
            </div>
            <label class="st-auth-checkbox-label">
              <input type="checkbox" id="st-up-terms" required>
              <span>I agree to the <a href="terms.html" target="_blank" style="color: #7c3aed; text-decoration: underline;">Terms of Service</a> and acknowledge my tutoring quota policy (Mandatory).</span>
            </label>
            <label class="st-auth-checkbox-label">
              <input type="checkbox" id="st-up-marketing">
              <span>Send me syllabus updates and Cambridge exam preparation guidance (Optional).</span>
            </label>
            <button type="submit" class="st-auth-submit-btn" id="st-btn-signup">Create Free Account</button>
          </form>

          <!-- STUDENT ACCOUNT SUMMARY (When logged in) -->
          <div id="st-account-view" style="display: none;">
            <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 20px;">
              <div class="st-avatar-dot" style="width: 48px; height: 48px; font-size: 18px;" id="st-acc-avatar">S</div>
              <div>
                <h3 id="st-acc-name" style="margin: 0; font-size: 16px; font-weight: 700;">Student User</h3>
                <p id="st-acc-email" style="margin: 2px 0 0; font-size: 13px; color: #64748b;">student@example.com</p>
              </div>
            </div>

            <div style="background: rgba(124, 58, 237, 0.05); border: 1px solid rgba(124, 58, 237, 0.15); border-radius: 12px; padding: 14px; margin-bottom: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 13px; font-weight: 600;">Daily AI Tutoring Allowance:</span>
                <span id="st-acc-quota" style="font-size: 12px; font-weight: 700; color: #7c3aed; background: rgba(124, 58, 237, 0.12); padding: 2px 8px; border-radius: 9999px;">5 / 5 questions</span>
              </div>
              <p style="margin: 0; font-size: 12px; color: #64748b;">Resets at midnight PKT (Asia/Karachi). 1 quota unit consumed per answered Socratic turn.</p>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; font-size: 13px;">
              <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9;">
                <span style="color: #64748b;">Email Status:</span>
                <span id="st-acc-email-status" style="font-weight: 600;">Unconfirmed</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9;">
                <span style="color: #64748b;">Service Terms:</span>
                <span id="st-acc-terms-status" style="font-weight: 600;">Accepted</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #f1f5f9;">
                <span style="color: #64748b;">Qualification Track:</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <select id="st-acc-qualification" class="st-auth-select" style="padding: 4px 8px; font-size: 12px; width: auto;">
                    <option value="" disabled selected>-- Select Track --</option>
                    <option value="o-level">Cambridge O-Level / IGCSE</option>
                    <option value="a-level">Cambridge International A-Level</option>
                  </select>
                  <button type="button" id="st-btn-save-qual" style="padding: 4px 8px; font-size: 11px; font-weight: 600; border-radius: 6px; background: #7c3aed; color: #fff; border: none; cursor: pointer; display: none;">Save</button>
                </div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0;">
                <span style="color: #64748b;">Marketing Consent:</span>
                <input type="checkbox" id="st-acc-marketing-toggle" style="accent-color: #7c3aed;">
              </div>
            </div>

            <div id="st-terms-action-box" style="display: none; margin-bottom: 16px;">
              <button class="st-auth-submit-btn" id="st-btn-accept-terms" style="background: #7c3aed;">Accept Terms to Unlock Tutoring</button>
            </div>

            <button type="button" class="st-auth-submit-btn" id="st-btn-signout" style="background: #f1f5f9; color: #0f172a; box-shadow: none;">Sign Out</button>
          </div>

          <!-- TERMS ONBOARDING VIEW -->
          <div id="st-terms-view" style="display: none;">
            <div style="background: rgba(124, 58, 237, 0.05); border: 1px solid rgba(124, 58, 237, 0.15); border-radius: 12px; padding: 14px; margin-bottom: 16px; font-size: 13px; line-height: 1.5; color: #334155;">
              <p style="margin: 0 0 8px; font-weight: 600; color: #0f172a;">Welcome to SmartTutors Cambridge AI Tutoring.</p>
              <p style="margin: 0 0 8px;">To activate your daily allowance of Socratic tutoring questions, please review and accept our service terms. Our Socratic tutor guides you through syllabus concepts step-by-step and adheres to strict student privacy protections.</p>
              <p style="margin: 0;"><a href="terms.html" target="_blank" style="color: #7c3aed; text-decoration: underline; font-weight: 600;">Read Full Terms of Service &nearr;</a> &nbsp;|&nbsp; <a href="privacy.html" target="_blank" style="color: #7c3aed; text-decoration: underline; font-weight: 600;">Privacy Policy &nearr;</a></p>
            </div>
            <p style="margin: 0 0 16px; font-size: 12px; color: #64748b; line-height: 1.4;">
              Notice: Declining will not log you out, but AI Chat tutoring will remain locked until terms are accepted. You can complete this at any time from your Account menu.
            </p>
            <button type="button" class="st-auth-submit-btn" id="st-btn-accept-terms-onboarding" style="margin-bottom: 10px;">Accept Terms & Unlock Tutoring</button>
            <div style="display: flex; gap: 8px;">
              <button type="button" id="st-btn-terms-later" style="flex: 1; padding: 10px; border-radius: 10px; border: 1px solid #cbd5e1; background: #fff; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer;">Review Later</button>
              <button type="button" id="st-btn-terms-signout" style="flex: 1; padding: 10px; border-radius: 10px; border: 1px solid #cbd5e1; background: #fff; font-size: 13px; font-weight: 600; color: #ef4444; cursor: pointer;">Sign Out</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalBackdrop);
    bindModalEvents();
  }

  function showAlert(msg, type = 'error') {
    const alert = document.getElementById('st-auth-alert');
    if (!alert) return;
    alert.textContent = msg;
    alert.className = 'st-auth-alert ' + type;
  }

  function hideAlert() {
    const alert = document.getElementById('st-auth-alert');
    if (alert) alert.className = 'st-auth-alert';
  }

  function setTab(tab) {
    activeTab = tab;
    hideAlert();
    const tabsContainer = document.querySelector('.st-auth-tabs');
    const titleEl = document.getElementById('st-auth-title');
    const subtitleEl = document.getElementById('st-auth-subtitle');
    const inTab = document.getElementById('st-tab-signin');
    const upTab = document.getElementById('st-tab-signup');
    const inForm = document.getElementById('st-signin-form');
    const upForm = document.getElementById('st-signup-form');
    const accView = document.getElementById('st-account-view');
    const termsView = document.getElementById('st-terms-view');

    if (inForm) inForm.style.display = 'none';
    if (upForm) upForm.style.display = 'none';
    if (accView) accView.style.display = 'none';
    if (termsView) termsView.style.display = 'none';
    if (tabsContainer) tabsContainer.style.display = 'flex';

    if (tab === 'signin') {
      if (titleEl) titleEl.textContent = 'Student Portal';
      if (subtitleEl) subtitleEl.textContent = 'Access Cambridge Socratic AI Tutoring';
      if (inTab) inTab.classList.add('active');
      if (upTab) upTab.classList.remove('active');
      if (inForm) inForm.style.display = 'flex';
    } else if (tab === 'signup') {
      if (titleEl) titleEl.textContent = 'Student Portal';
      if (subtitleEl) subtitleEl.textContent = 'Access Cambridge Socratic AI Tutoring';
      if (upTab) upTab.classList.add('active');
      if (inTab) inTab.classList.remove('active');
      if (upForm) upForm.style.display = 'flex';
    } else if (tab === 'account') {
      if (tabsContainer) tabsContainer.style.display = 'none';
      if (titleEl) titleEl.textContent = 'Student Account';
      if (subtitleEl) subtitleEl.textContent = 'Manage profile & tutoring quota';
      if (accView) accView.style.display = 'block';
      renderAccountView();
    } else if (tab === 'terms') {
      if (tabsContainer) tabsContainer.style.display = 'none';
      if (titleEl) titleEl.textContent = 'Terms of Service Review';
      if (subtitleEl) subtitleEl.textContent = 'Activate your Cambridge Socratic AI Tutoring';
      if (termsView) termsView.style.display = 'block';
    }

    if (tab === 'signin' || tab === 'signup') {
      const signinBtn = document.getElementById('st-btn-signin');
      const signupBtn = document.getElementById('st-btn-signup');
      if (typeof Auth.isConfigured === 'function' && !Auth.isConfigured()) {
        showAlert('Student authentication is currently not configured for this environment. AI tutoring remains available under guest mode.', 'warning');
        if (signinBtn) signinBtn.disabled = true;
        if (signupBtn) signupBtn.disabled = true;
      } else {
        if (signinBtn) signinBtn.disabled = false;
        if (signupBtn) signupBtn.disabled = false;
      }
    }
  }

  function openModal(tab = 'signin') {
    createAuthModal();
    setTab(tab);
    modalBackdrop.classList.add('st-active');
  }

  function closeModal() {
    if (modalBackdrop) modalBackdrop.classList.remove('st-active');
    hideAlert();
  }

  function renderAccountView() {
    const user = Auth.getUser();
    const profile = Auth.getProfile();
    if (!user) return;

    const nameEl = document.getElementById('st-acc-name');
    const emailEl = document.getElementById('st-acc-email');
    const avatarEl = document.getElementById('st-acc-avatar');
    const emailStatEl = document.getElementById('st-acc-email-status');
    const termsStatEl = document.getElementById('st-acc-terms-status');
    const mktToggle = document.getElementById('st-acc-marketing-toggle');
    const termsActionBox = document.getElementById('st-terms-action-box');
    const qualSelect = document.getElementById('st-acc-qualification');
    const saveQualBtn = document.getElementById('st-btn-save-qual');

    const displayName = (profile && profile.full_name) || (user.user_metadata && user.user_metadata.full_name) || user.email.split('@')[0];
    if (nameEl) nameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = user.email;
    if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();

    const isEmailConfirmed = Boolean(user.email_confirmed_at);
    if (emailStatEl) {
      emailStatEl.textContent = isEmailConfirmed ? '✓ Confirmed' : '⚠ Unconfirmed';
      emailStatEl.style.color = isEmailConfirmed ? '#16a34a' : '#ea580c';
    }

    const termsAccepted = Boolean(profile && profile.service_terms_accepted);
    if (termsStatEl) {
      termsStatEl.textContent = termsAccepted ? '✓ Accepted' : '⚠ Pending Acceptance';
      termsStatEl.style.color = termsAccepted ? '#16a34a' : '#ea580c';
    }

    if (termsActionBox) {
      termsActionBox.style.display = (!termsAccepted && isEmailConfirmed) ? 'block' : 'none';
    }

    if (mktToggle && profile) {
      mktToggle.checked = Boolean(profile.marketing_consent);
    }

    if (qualSelect) {
      const assignedQual = (profile && profile.qualification) || '';
      if (assignedQual === 'o-level' || assignedQual === 'a-level') {
        qualSelect.value = assignedQual;
      } else {
        qualSelect.value = '';
      }
    }
    if (saveQualBtn) {
      saveQualBtn.style.display = 'none';
      saveQualBtn.disabled = false;
      saveQualBtn.textContent = 'Save';
    }
  }

  function bindModalEvents() {
    document.getElementById('st-auth-close-btn')?.addEventListener('click', closeModal);
    modalBackdrop?.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeModal();
    });

    document.getElementById('st-tab-signin')?.addEventListener('click', () => setTab('signin'));
    document.getElementById('st-tab-signup')?.addEventListener('click', () => setTab('signup'));

    // Handle Sign In submit
    document.getElementById('st-signin-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();
      const btn = document.getElementById('st-btn-signin');
      const email = document.getElementById('st-in-email').value;
      const pass = document.getElementById('st-in-password').value;

      try {
        btn.disabled = true;
        btn.textContent = 'Signing in...';
        await Auth.signIn({ email, password: pass });
        const profile = Auth.getProfile();
        if (profile && profile.service_terms_accepted === false) {
          hasPromptedTermsThisSession = true;
          setTab('terms');
        } else {
          showAlert('Signed in successfully!', 'success');
          setTimeout(() => {
            closeModal();
          }, 600);
        }
      } catch (err) {
        showAlert(err.message || 'Failed to sign in. Please check your credentials.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    });

    // Handle Sign Up submit
    document.getElementById('st-signup-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();
      const btn = document.getElementById('st-btn-signup');
      const fullName = document.getElementById('st-up-name').value;
      const email = document.getElementById('st-up-email').value;
      const password = document.getElementById('st-up-password').value;
      const qualification = document.getElementById('st-up-qual').value;
      const mobile = document.getElementById('st-up-mobile').value;
      const termsAccepted = document.getElementById('st-up-terms').checked;
      const marketingConsent = document.getElementById('st-up-marketing').checked;

      try {
        btn.disabled = true;
        btn.textContent = 'Creating Account...';
        const res = await Auth.signUp({
          fullName, email, password, qualification, mobile, termsAccepted, marketingConsent
        });

        if (res.needsEmailConfirmation) {
          showAlert('Account created! Please check your email inbox to confirm your email before signing in.', 'success');
        } else {
          showAlert('Account created and verified! Welcome to SmartTutors.', 'success');
          setTimeout(() => closeModal(), 1000);
        }
      } catch (err) {
        showAlert(err.message || 'Registration failed. Please check your inputs.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Free Account';
      }
    });

    // Handle Sign Out button
    document.getElementById('st-btn-signout')?.addEventListener('click', async () => {
      await Auth.signOut();
      closeModal();
    });

    // Handle Qualification track change and save
    const qualSelect = document.getElementById('st-acc-qualification');
    const saveQualBtn = document.getElementById('st-btn-save-qual');
    qualSelect?.addEventListener('change', () => {
      const profile = Auth.getProfile();
      const currentVal = (profile && profile.qualification) || '';
      if (saveQualBtn) {
        if (qualSelect.value && qualSelect.value !== currentVal) {
          saveQualBtn.style.display = 'inline-block';
        } else {
          saveQualBtn.style.display = 'none';
        }
      }
    });

    saveQualBtn?.addEventListener('click', async () => {
      const newVal = qualSelect ? qualSelect.value : '';
      if (!newVal || (newVal !== 'o-level' && newVal !== 'a-level')) {
        showAlert('Please select a valid qualification track (O-Level or A-Level).');
        return;
      }
      try {
        saveQualBtn.disabled = true;
        saveQualBtn.textContent = 'Saving...';
        await Auth.updateQualification(newVal);
        showAlert('Qualification updated successfully!', 'success');
        saveQualBtn.style.display = 'none';
        saveQualBtn.disabled = false;
        saveQualBtn.textContent = 'Save';
      } catch (err) {
        showAlert(err.message || 'Failed to update qualification.');
        saveQualBtn.disabled = false;
        saveQualBtn.textContent = 'Save';
      }
    });

    // Handle Accept Terms button in account drawer
    document.getElementById('st-btn-accept-terms')?.addEventListener('click', async () => {
      try {
        await Auth.acceptTerms();
        showAlert('Terms accepted successfully!', 'success');
        renderAccountView();
      } catch (err) {
        showAlert(err.message || 'Failed to record terms acceptance.');
      }
    });

    // Handle Accept Terms in onboarding view
    document.getElementById('st-btn-accept-terms-onboarding')?.addEventListener('click', async () => {
      const btn = document.getElementById('st-btn-accept-terms-onboarding');
      try {
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Accepting...';
        }
        await Auth.acceptTerms();
        showAlert('Terms accepted successfully! Tutoring unlocked.', 'success');
        setTimeout(() => {
          closeModal();
        }, 600);
      } catch (err) {
        showAlert(err.message || 'Failed to record terms acceptance.');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Accept Terms & Unlock Tutoring';
        }
      }
    });

    // Handle Review Later button
    document.getElementById('st-btn-terms-later')?.addEventListener('click', () => {
      closeModal();
    });

    // Handle Terms Sign Out button
    document.getElementById('st-btn-terms-signout')?.addEventListener('click', async () => {
      await Auth.signOut();
      closeModal();
    });

    // Handle Marketing Consent toggle
    document.getElementById('st-acc-marketing-toggle')?.addEventListener('change', async (e) => {
      try {
        await Auth.updateMarketingConsent(e.target.checked);
      } catch (err) {
        showAlert(err.message || 'Failed to update marketing preferences.');
      }
    });
  }

  /* ── Navbar Mount ── */
  function mountNavbarAuthButton() {
    injectAuthStyles();
    const navRight = document.querySelector('.nav-right');
    const mobileBottom = document.querySelector('.mobile-bottom');
    if (!navRight) return;

    // Remove existing if any
    document.getElementById('st-nav-auth-container')?.remove();

    const container = document.createElement('div');
    container.id = 'st-nav-auth-container';
    container.style.display = 'inline-flex';
    container.style.alignItems = 'center';

    navRight.insertBefore(container, navRight.firstChild);

    Auth.onAuthStateChange((session, profile) => {
      if (session && session.user) {
        const name = (profile && profile.full_name) || (session.user.user_metadata && session.user.user_metadata.full_name) || session.user.email.split('@')[0];
        const isTermsPending = Boolean(profile && profile.service_terms_accepted === false);
        const displayName = isTermsPending ? `${name.split(' ')[0]} (Terms Pending)` : name.split(' ')[0];

        container.innerHTML = `
          <button class="st-account-pill" id="st-pill-btn" aria-label="Student Account">
            <span class="st-avatar-dot">${name.charAt(0).toUpperCase()}</span>
            <span>${displayName}</span>
          </button>
        `;
        document.getElementById('st-pill-btn')?.addEventListener('click', () => {
          if (isTermsPending) {
            openModal('terms');
          } else {
            openModal('account');
          }
        });

        if (isTermsPending && !hasPromptedTermsThisSession) {
          hasPromptedTermsThisSession = true;
          openModal('terms');
        }
      } else {
        hasPromptedTermsThisSession = false;
        container.innerHTML = `
          <button class="st-nav-auth-btn" id="st-login-btn">
            <span>Sign In</span>
          </button>
        `;
        document.getElementById('st-login-btn')?.addEventListener('click', () => openModal('signin'));
      }
    });
  }

  // Auto mount on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountNavbarAuthButton);
  } else {
    mountNavbarAuthButton();
  }

  window.SmartTutorsAuthUI = {
    openModal,
    closeModal,
    setTab
  };

})(window, document);
