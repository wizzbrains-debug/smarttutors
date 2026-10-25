/**
 * SmartTutors — Onboarding, Qualification & Prompt Preservation Regression Suite (Phase 2.19)
 *
 * Verifies 22 regression test cases:
 * - Case 1: Existing user with service_terms_accepted: false receives terms prompt.
 * - Case 2: User with service_terms_accepted: true does not receive terms prompt.
 * - Case 3: Opening or dismissing prompt (closeModal / "Review Later") does not call acceptTerms().
 * - Case 4: Explicit click on accept button calls Auth.acceptTerms() / RPC exactly once.
 * - Case 5: RPC failure displays error alert and does not falsely show success or close modal.
 * - Case 6: HTTP 403 service_terms_not_accepted preserves prompt in input box and opens terms UI.
 * - Case 7: Unrelated HTTP 403 (e.g. email_not_confirmed) does not trigger terms UI.
 * - Case 8: Original question is not overwritten if user edits input during request (if (!input.value)).
 * - Case 9: Session-expiration recovery preserves question and prevents guest fallback.
 * - Case 10: UI locks, input, and send button are re-enabled on error.
 * - Case 11: Auth.updateQualification() sends PATCH to /rest/v1/students and refreshes profile.
 * - Case 12: Failed qualification update leaves displayed value unchanged.
 * - Case 13: Repeated session events do not duplicate prompts or event listeners.
 * - Case 14: Null or missing qualification displays explicit unselected state in Account drawer.
 * - Case 15: Auth.updateQualification() client validation strictly rejects non-allowed values.
 * - Case 16: HTTP 403 with HTML or malformed body preserves question and does not open terms modal.
 * - Case 17: HTTP 500 with HTML or malformed body preserves question, releases locks, and falls back cleanly.
 * - Case 18: Network failure during request preserves original question and releases UI locks.
 * - Case 19: Clicking terms-view Sign Out invokes Auth.signOut and closes modal.
 * - Case 20: Backdrop or close-button dismissal on terms view does not record terms consent.
 * - Case 21: Qualification Save button click with empty selection rejects update and shows validation error.
 * - Case 22: Initial profile fetch rejection does not crash UI, preserves unverified consent, and offers recovery path.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let testsPassed = 0;
let testsFailed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`✔ [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`✖ [FAIL] ${name}:`, err.message);
    testsFailed++;
  }
}

function mockResponse({ ok = true, status = 200, json = null, text = null }) {
  const bodyText = text !== null ? text : (json !== null ? JSON.stringify(json) : '');
  let bodyJson = json;
  if (bodyJson === null) {
    try {
      bodyJson = JSON.parse(bodyText);
    } catch (_e) {
      bodyJson = {};
    }
  }
  return {
    ok,
    status,
    headers: {
      get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null)
    },
    json: async () => bodyJson,
    text: async () => bodyText
  };
}

function createMockElement(id = '', tag = 'div', className = '') {
  const listeners = {};
  const children = [];
  const classListSet = new Set(className.split(/\s+/).filter(Boolean));
  let _id = id;
  let rawInnerHTML = '';

  const el = {
    get id() {
      return _id;
    },
    set id(val) {
      _id = val;
      if (el._ownerDoc && el._ownerDoc._registerElement) {
        el._ownerDoc._registerElement(val, el);
      }
    },
    tagName: tag.toUpperCase(),
    value: '',
    checked: false,
    disabled: false,
    textContent: '',
    scrollTop: 0,
    scrollHeight: 100,
    dataset: {},
    style: {},
    children,
    _listeners: listeners,
    get className() {
      return Array.from(classListSet).join(' ');
    },
    set className(val) {
      classListSet.clear();
      if (val) {
        val.split(/\s+/).forEach(c => c && classListSet.add(c));
      }
    },
    classList: {
      add: (cls) => classListSet.add(cls),
      remove: (cls) => classListSet.delete(cls),
      toggle: (cls, force) => {
        if (force === undefined) {
          if (classListSet.has(cls)) classListSet.delete(cls);
          else classListSet.add(cls);
        } else if (force) {
          classListSet.add(cls);
        } else {
          classListSet.delete(cls);
        }
      },
      contains: (cls) => classListSet.has(cls)
    },
    addEventListener: (evt, fn) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (listeners[evt]) {
        listeners[evt] = listeners[evt].filter(f => f !== fn);
      }
    },
    dispatchEvent: async (event) => {
      const evtName = typeof event === 'string' ? event : event.type;
      const evtObj = typeof event === 'string' ? { type: event, target: el, preventDefault: () => {} } : event;
      if (!evtObj.target) evtObj.target = el;
      if (!evtObj.preventDefault) evtObj.preventDefault = () => {};
      if (listeners[evtName]) {
        for (const fn of [...listeners[evtName]]) {
          await fn(evtObj);
        }
      }
    },
    click: async () => {
      await el.dispatchEvent({ type: 'click', target: el, preventDefault: () => {} });
    },
    appendChild: (child) => {
      child._parent = el;
      if (!children.includes(child)) {
        children.push(child);
      }
      return child;
    },
    insertBefore: (newChild, refChild) => {
      newChild._parent = el;
      const idx = children.indexOf(refChild);
      if (idx !== -1) children.splice(idx, 0, newChild);
      else children.push(newChild);
      return newChild;
    },
    remove: function () {
      el._removed = true;
      if (el._parent && el._parent.children) {
        const idx = el._parent.children.indexOf(el);
        if (idx !== -1) {
          el._parent.children.splice(idx, 1);
        }
      }
    },
    focus: function () {
      el._focused = true;
    },
    querySelector: function (sel) {
      if (sel === '.ai-msg-body') {
        return children.find(c => c.classList && c.classList.contains('ai-msg-body')) || null;
      }
      return null;
    },
    querySelectorAll: function () {
      return [];
    }
  };

  Object.defineProperty(el, 'innerHTML', {
    get: () => rawInnerHTML,
    set: (html) => {
      rawInnerHTML = html;
      if (!html.includes('<')) {
        el.textContent = html;
      }
      if (el._ownerDoc && el._ownerDoc._registerFromHtml) {
        el._ownerDoc._registerFromHtml(html, el);
      }
    }
  });

  return el;
}

function createAuthUIEnvironment({ authMock = null, customFetch = null } = {}) {
  const elements = {};
  const querySelectorMap = {};
  let mockDocument;

  function getOrCreateElement(id, tag = 'div', className = '') {
    if (elements[id]) return elements[id];
    const el = createMockElement(id, tag, className);
    el._ownerDoc = mockDocument;
    elements[id] = el;
    return el;
  }

  mockDocument = {
    readyState: 'complete',
    head: createMockElement('head', 'head'),
    body: createMockElement('body', 'body'),
    getElementById: (id) => elements[id] || null,
    querySelector: (sel) => {
      if (querySelectorMap[sel]) return querySelectorMap[sel];
      if (sel.startsWith('.')) {
        const cls = sel.substring(1);
        for (const id in elements) {
          if (elements[id].classList && elements[id].classList.contains(cls)) {
            return elements[id];
          }
        }
      }
      return null;
    },
    createElement: (tag) => {
      const el = createMockElement('', tag);
      el._ownerDoc = mockDocument;
      return el;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    _registerElement: (id, element) => {
      elements[id] = element;
    },
    _registerFromHtml: (html, parentEl) => {
      const tagMatches = html.matchAll(/<([a-zA-Z0-9-]+)[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/\1>/g);
      for (const m of tagMatches) {
        const id = m[2];
        const inner = m[3];
        const childEl = getOrCreateElement(id, m[1]);
        childEl.innerHTML = inner;
        childEl.textContent = inner.replace(/<[^>]+>/g, '').trim();
        if (parentEl && !parentEl.children.includes(childEl)) {
          parentEl.appendChild(childEl);
        }
      }
      const selfClosingMatches = html.matchAll(/<([a-zA-Z0-9-]+)[^>]*\bid=["']([^"']+)["'][^>]*\/?>/g);
      for (const m of selfClosingMatches) {
        const id = m[2];
        const childEl = getOrCreateElement(id, m[1]);
        if (parentEl && !parentEl.children.includes(childEl)) {
          parentEl.appendChild(childEl);
        }
      }
      const classMatches = html.matchAll(/class=["']([^"']+)["']/g);
      for (const cm of classMatches) {
        const classes = cm[1].split(/\s+/).filter(Boolean);
        for (const cls of classes) {
          if (!querySelectorMap['.' + cls]) {
            const parentWithClass = createMockElement('', 'div', cls);
            parentWithClass._ownerDoc = mockDocument;
            querySelectorMap['.' + cls] = parentWithClass;
          }
        }
      }
    }
  };

  mockDocument.head._ownerDoc = mockDocument;
  mockDocument.body._ownerDoc = mockDocument;

  // Pre-seed known navbar containers
  const navRight = getOrCreateElement('nav-right', 'div', 'nav-right');
  const mobileBottom = getOrCreateElement('mobile-bottom', 'div', 'mobile-bottom');
  querySelectorMap['.nav-right'] = navRight;
  querySelectorMap['.mobile-bottom'] = mobileBottom;

  const storage = {};
  const mockLocalStorage = {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  };

  const mockWindow = {
    document: mockDocument,
    localStorage: mockLocalStorage,
    SmartTutorsAuth: authMock || {
      getUser: () => null,
      getProfile: () => null,
      isConfigured: () => true,
      onAuthStateChange: () => {},
      signIn: async () => {},
      signUp: async () => {},
      signOut: async () => {},
      acceptTerms: async () => {},
      updateQualification: async () => {},
      updateMarketingConsent: async () => {}
    },
    fetch: customFetch || (async () => mockResponse({})),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id)
  };

  const uiCode = fs.readFileSync(path.join(__dirname, '../js/auth-ui.js'), 'utf8');
  const context = vm.createContext({
    window: mockWindow,
    document: mockDocument,
    console,
    Date,
    JSON,
    Math,
    Error,
    Object,
    Array,
    String,
    Boolean,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id)
  });

  vm.runInContext(uiCode, context);

  return {
    authUI: context.window.SmartTutorsAuthUI,
    window: context.window,
    document: mockDocument,
    elements
  };
}

function createWidgetEnvironment({ auth = null, authUI = null, fetchFn = null } = {}) {
  const elements = {
    'ai-fab': createMockElement('ai-fab'),
    'ai-chat-drawer': createMockElement('ai-chat-drawer'),
    'ai-chat-close': createMockElement('ai-chat-close'),
    'ai-chat-messages': createMockElement('ai-chat-messages'),
    'ai-chat-input': createMockElement('ai-chat-input', 'textarea'),
    'ai-chat-send': createMockElement('ai-chat-send', 'button'),
    'ai-subject-select': createMockElement('ai-subject-select', 'select')
  };

  const storage = {};
  const mockLocalStorage = {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  };

  const mockDocument = {
    readyState: 'complete',
    getElementById: (id) => {
      if (elements[id]) return elements[id];
      if (elements['ai-chat-messages']) {
        for (const child of elements['ai-chat-messages'].children) {
          if (child.id === id) return child;
        }
      }
      return null;
    },
    createElement: (tag) => createMockElement('', tag),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const mockWindow = {
    document: mockDocument,
    localStorage: mockLocalStorage,
    SmartTutorsAuth: auth,
    SmartTutorsAuthUI: authUI,
    fetch: fetchFn || (async () => mockResponse({ json: { reply: 'Mock Socratic reply' } })),
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {}
  };

  const widgetCode = fs.readFileSync(path.join(__dirname, '../js/ai-widget.js'), 'utf8');
  const context = vm.createContext({
    window: mockWindow,
    document: mockDocument,
    localStorage: mockLocalStorage,
    fetch: (...args) => mockWindow.fetch(...args),
    console,
    Date,
    JSON,
    Math,
    Error,
    Object,
    Array,
    String,
    Boolean,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id)
  });

  vm.runInContext(widgetCode, context);

  return {
    window: mockWindow,
    document: mockDocument,
    elements
  };
}

function createAuthEngineEnvironment({ config = {}, initialStorage = {}, fetchFn = null } = {}) {
  const localStorageStore = { ...initialStorage };
  const mockLocalStorage = {
    getItem: (key) => (key in localStorageStore ? localStorageStore[key] : null),
    setItem: (key, val) => { localStorageStore[key] = String(val); },
    removeItem: (key) => { delete localStorageStore[key]; }
  };

  const mockWindow = {
    SMARTTUTORS_SUPABASE_URL: config.supabaseUrl || 'https://gfzffxvpmotjuydcvfav.supabase.co',
    SMARTTUTORS_SUPABASE_ANON_KEY: config.supabaseAnonKey || 'anon-key-sample-12345678901234567890',
    localStorage: mockLocalStorage,
    fetch: fetchFn || (async () => mockResponse({}))
  };

  const mockDocument = {
    readyState: 'complete',
    addEventListener: () => {}
  };

  const authCode = fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8');
  const context = vm.createContext({
    window: mockWindow,
    document: mockDocument,
    localStorage: mockLocalStorage,
    fetch: (...args) => mockWindow.fetch(...args),
    console,
    Date,
    JSON,
    Math,
    Error,
    Object,
    Array,
    String,
    Boolean,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id)
  });

  vm.runInContext(authCode, context);
  return {
    auth: context.window.SmartTutorsAuth,
    storage: localStorageStore,
    window: context.window
  };
}

async function main() {
  console.log('=== Running SmartTutors Phase 2.19 Onboarding & Prompt Preservation Test Suite ===\n');

  /* ── Case 1: Existing user with service_terms_accepted: false receives terms prompt ── */
  await runTest('Case 1: Existing user with service_terms_accepted: false receives terms prompt', async () => {
    let authCallback = null;

    const authMock = {
      getUser: () => ({ id: 'usr-1', email: 'student@example.com' }),
      getProfile: () => ({ full_name: 'Existing Student', service_terms_accepted: false, qualification: 'o-level' }),
      isConfigured: () => true,
      onAuthStateChange: (cb) => { authCallback = cb; }
    };

    const env = createAuthUIEnvironment({ authMock });
    assert(authCallback, 'Auth state change listener must be registered');

    // Simulate session restore with unaccepted terms
    authCallback(
      { user: { id: 'usr-1', email: 'student@example.com' } },
      { full_name: 'Existing Student', service_terms_accepted: false, qualification: 'o-level' }
    );

    const pillBtn = env.elements['st-pill-btn'];
    assert(pillBtn, 'Navbar pill button must be mounted');
    const navContainer = env.elements['st-nav-auth-container'];
    assert(
      (pillBtn.innerHTML && pillBtn.innerHTML.includes('(Terms Pending)')) ||
      (navContainer && navContainer.innerHTML.includes('(Terms Pending)')),
      'Pill button must display (Terms Pending) indicator'
    );

    const modalBackdrop = env.elements['st-auth-modal'];
    assert(modalBackdrop && modalBackdrop.classList.contains('st-active'), 'Terms modal must open on unaccepted terms');

    const termsView = env.elements['st-terms-view'];
    assert.strictEqual(termsView.style.display, 'block', 'Terms review view must be displayed');
  });

  /* ── Case 2: User with service_terms_accepted: true does not receive terms prompt ── */
  await runTest('Case 2: User with service_terms_accepted: true does not receive terms prompt', async () => {
    let authCallback = null;

    const authMock = {
      getUser: () => ({ id: 'usr-2', email: 'verified@example.com' }),
      getProfile: () => ({ full_name: 'Verified Student', service_terms_accepted: true, qualification: 'o-level' }),
      isConfigured: () => true,
      onAuthStateChange: (cb) => { authCallback = cb; }
    };

    const env = createAuthUIEnvironment({ authMock });
    authCallback(
      { user: { id: 'usr-2', email: 'verified@example.com' } },
      { full_name: 'Verified Student', service_terms_accepted: true, qualification: 'o-level' }
    );

    const pillBtn = env.elements['st-pill-btn'];
    assert(pillBtn, 'Navbar pill button must be mounted');
    assert(!pillBtn.innerHTML.includes('(Terms Pending)'), 'Pill button must NOT display (Terms Pending)');

    const modalBackdrop = env.elements['st-auth-modal'];
    assert(!modalBackdrop || !modalBackdrop.classList.contains('st-active'), 'Modal must NOT be automatically opened');
  });

  /* ── Case 3: Opening or dismissing prompt does not call acceptTerms() ── */
  await runTest('Case 3: Opening or dismissing prompt (Review Later) does not call acceptTerms()', async () => {
    let acceptTermsCalled = 0;

    const authMock = {
      getUser: () => ({ id: 'usr-3', email: 'later@example.com' }),
      getProfile: () => ({ full_name: 'Later Student', service_terms_accepted: false }),
      isConfigured: () => true,
      onAuthStateChange: () => {},
      acceptTerms: async () => { acceptTermsCalled++; }
    };

    const env = createAuthUIEnvironment({ authMock });
    env.authUI.openModal('terms');

    const modalBackdrop = env.elements['st-auth-modal'];
    assert(modalBackdrop && modalBackdrop.classList.contains('st-active'), 'Modal must be active');

    const laterBtn = env.elements['st-btn-terms-later'];
    assert(laterBtn, 'Review Later button must exist');
    await laterBtn.click();

    assert(!modalBackdrop.classList.contains('st-active'), 'Modal must be closed after Review Later');
    assert.strictEqual(acceptTermsCalled, 0, 'acceptTerms must NOT be called when dismissing');
  });

  /* ── Case 4: Explicit click on accept button calls Auth.acceptTerms() exactly once ── */
  await runTest('Case 4: Explicit click on accept button calls Auth.acceptTerms() exactly once', async () => {
    let acceptTermsCount = 0;

    const authMock = {
      getUser: () => ({ id: 'usr-4', email: 'accept@example.com' }),
      getProfile: () => ({ full_name: 'Accept Student', service_terms_accepted: false }),
      isConfigured: () => true,
      onAuthStateChange: () => {},
      acceptTerms: async () => {
        acceptTermsCount++;
        return { success: true };
      }
    };

    const env = createAuthUIEnvironment({ authMock });
    env.authUI.openModal('terms');

    const acceptBtn = env.elements['st-btn-accept-terms-onboarding'];
    assert(acceptBtn, 'Accept button must exist in onboarding view');
    await acceptBtn.click();

    assert.strictEqual(acceptTermsCount, 1, 'Auth.acceptTerms() must be called exactly once');
    const alertEl = env.elements['st-auth-alert'];
    assert(alertEl.textContent.includes('Terms accepted successfully'), 'Success alert must be shown');
    assert(alertEl.className.includes('success'), 'Alert class must be success');
  });

  /* ── Case 5: RPC failure displays error alert and does not falsely show success or close modal ── */
  await runTest('Case 5: RPC failure displays error alert and does not falsely show success or close modal', async () => {
    const authMock = {
      getUser: () => ({ id: 'usr-5', email: 'fail@example.com' }),
      getProfile: () => ({ full_name: 'Fail Student', service_terms_accepted: false }),
      isConfigured: () => true,
      onAuthStateChange: () => {},
      acceptTerms: async () => {
        throw new Error('Supabase RPC network timeout');
      }
    };

    const env = createAuthUIEnvironment({ authMock });
    env.authUI.openModal('terms');

    const acceptBtn = env.elements['st-btn-accept-terms-onboarding'];
    await acceptBtn.click();

    const alertEl = env.elements['st-auth-alert'];
    assert(alertEl.textContent.includes('Supabase RPC network timeout'), 'Error alert must display exact failure message');
    assert(!alertEl.className.includes('success'), 'Alert class must NOT be success');

    const modalBackdrop = env.elements['st-auth-modal'];
    assert(modalBackdrop && modalBackdrop.classList.contains('st-active'), 'Modal must remain open after failure');
    assert.strictEqual(acceptBtn.disabled, false, 'Accept button must be re-enabled for retry');
  });

  /* ── Case 6: HTTP 403 service_terms_not_accepted preserves prompt in input box and opens terms UI ── */
  await runTest('Case 6: HTTP 403 service_terms_not_accepted preserves prompt in input box and opens terms UI', async () => {
    let openedTab = null;
    const authMock = {
      getValidAccessToken: async () => 'test-bearer-token',
      getUser: () => ({ id: 'usr-6', email: 'terms403@example.com' })
    };
    const authUIMock = {
      openModal: (tab) => { openedTab = tab; }
    };

    const customFetch = async () => mockResponse({
      ok: false,
      status: 403,
      json: {
        error: 'Student terms not accepted',
        code: 'service_terms_not_accepted'
      }
    });

    const env = createWidgetEnvironment({ auth: authMock, authUI: authUIMock, fetchFn: customFetch });
    const input = env.elements['ai-chat-input'];

    const testPrompt = 'Calculate kinetic energy for a 2kg mass moving at 5m/s';
    input.value = testPrompt;

    await env.window.SmartTutorsAI.sendMessage(testPrompt);

    assert.strictEqual(input.value, testPrompt, 'Student prompt must be restored to input box');
    assert.strictEqual(openedTab, 'terms', 'Terms modal must be triggered on service_terms_not_accepted code');
    assert.strictEqual(env.elements['ai-chat-send'].disabled, false, 'Send button must be re-enabled');
  });

  /* ── Case 7: Unrelated HTTP 403 (e.g. email_not_confirmed) does not trigger terms UI ── */
  await runTest('Case 7: Unrelated HTTP 403 (email_not_confirmed) does not trigger terms UI', async () => {
    let openedTab = null;
    const authMock = {
      getValidAccessToken: async () => 'test-bearer-token',
      getUser: () => ({ id: 'usr-7', email: 'unconfirmed@example.com' })
    };
    const authUIMock = {
      openModal: (tab) => { openedTab = tab; }
    };

    const customFetch = async () => mockResponse({
      ok: false,
      status: 403,
      json: {
        error: 'Please confirm your email address before using AI tutoring.',
        code: 'email_not_confirmed'
      }
    });

    const env = createWidgetEnvironment({ auth: authMock, authUI: authUIMock, fetchFn: customFetch });
    const input = env.elements['ai-chat-input'];

    const testPrompt = 'What is refraction?';
    input.value = testPrompt;

    await env.window.SmartTutorsAI.sendMessage(testPrompt);

    assert.strictEqual(input.value, testPrompt, 'Prompt must still be preserved');
    assert.strictEqual(openedTab, null, 'Terms modal must NOT be opened for email_not_confirmed error');
    assert.strictEqual(env.elements['ai-chat-send'].disabled, false, 'Send button must be unlocked');
  });

  /* ── Case 8: Original question is not overwritten if user edits input during request ── */
  await runTest('Case 8: Original question is not overwritten if user edits input during request', async () => {
    let requestResolve;
    const pendingPromise = new Promise((resolve) => { requestResolve = resolve; });

    const authMock = {
      getValidAccessToken: async () => 'test-bearer-token',
      getUser: () => ({ id: 'usr-8' })
    };

    const customFetch = async () => {
      await pendingPromise;
      return mockResponse({
        ok: false,
        status: 429,
        json: { error: 'Daily question quota exceeded', code: 'quota_exceeded' }
      });
    };

    const env = createWidgetEnvironment({ auth: authMock, fetchFn: customFetch });
    const input = env.elements['ai-chat-input'];

    input.value = 'Initial question';
    const sendPromise = env.window.SmartTutorsAI.sendMessage('Initial question');

    // While request is in flight, student types a new thought
    input.value = 'New question typed while waiting';

    // Finish fetch
    requestResolve();
    await sendPromise;

    // input.value must NOT be overwritten with 'Initial question'
    assert.strictEqual(input.value, 'New question typed while waiting', 'User edits made while in flight must be preserved');
  });

  /* ── Case 9: Session-expiration recovery preserves question and prevents guest fallback ── */
  await runTest('Case 9: Session-expiration recovery preserves question and prevents guest fallback', async () => {
    let fetchCalled = false;
    let openedTab = null;

    const authMock = {
      getUser: () => ({ id: 'usr-9', email: 'expired@example.com' }),
      getValidAccessToken: async () => null // Refresh failed
    };
    const authUIMock = {
      openModal: (tab) => { openedTab = tab; }
    };

    const customFetch = async () => {
      fetchCalled = true;
      return mockResponse({});
    };

    const env = createWidgetEnvironment({ auth: authMock, authUI: authUIMock, fetchFn: customFetch });
    const input = env.elements['ai-chat-input'];

    input.value = 'Explain thermal equilibrium';
    await env.window.SmartTutorsAI.sendMessage('Explain thermal equilibrium');

    assert.strictEqual(fetchCalled, false, 'api/chat fetch must NOT be called as guest when authenticated session expires');
    assert.strictEqual(input.value, 'Explain thermal equilibrium', 'Input text must be preserved on session failure');
    assert.strictEqual(openedTab, 'signin', 'Sign-in modal must be triggered for re-authentication');
  });

  /* ── Case 10: UI locks, input, and send button are re-enabled on error ── */
  await runTest('Case 10: UI locks, input, and send button are re-enabled on error', async () => {
    const authMock = {
      getValidAccessToken: async () => 'valid-token',
      getUser: () => ({ id: 'usr-10' })
    };

    const customFetch = async () => mockResponse({
      ok: false,
      status: 500,
      json: { error: 'Internal AI service error', code: 'service_error' }
    });

    const env = createWidgetEnvironment({ auth: authMock, fetchFn: customFetch });
    const drawer = env.elements['ai-chat-drawer'];
    const input = env.elements['ai-chat-input'];
    const sendBtn = env.elements['ai-chat-send'];

    input.value = 'Test question 500';
    await env.window.SmartTutorsAI.sendMessage('Test question 500');

    assert.strictEqual(input.disabled, false, 'Input field must be enabled');
    assert.strictEqual(sendBtn.disabled, false, 'Send button must be enabled');
    assert.strictEqual(drawer.classList.contains('ai-loading'), false, 'Loading class must be removed');
  });

  /* ── Case 11: Auth.updateQualification() sends PATCH to /rest/v1/students and refreshes profile ── */
  await runTest('Case 11: Auth.updateQualification() sends PATCH to /rest/v1/students and refreshes profile', async () => {
    const fetchCalls = [];

    const mockFetch = async (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (url.includes('/rest/v1/students') && options.method === 'PATCH') {
        return mockResponse({ ok: true, status: 204, text: '' });
      }
      if (url.includes('/rest/v1/students') && (!options.method || options.method === 'GET')) {
        return mockResponse({
          ok: true,
          status: 200,
          json: [{
            id: 'uuid-11',
            full_name: 'Track Student',
            qualification: 'a-level',
            service_terms_accepted: true
          }]
        });
      }
      return mockResponse({});
    };

    const initialStorage = {
      'st_auth_session': JSON.stringify({
        access_token: 'auth-jwt-token-11',
        refresh_token: 'refresh-token-11',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'uuid-11', email: 'track@example.com' }
      })
    };

    const engineEnv = createAuthEngineEnvironment({ initialStorage, fetchFn: mockFetch });
    await engineEnv.auth.fetchStudentProfile();
    await engineEnv.auth.updateQualification('a-level');

    const patchCall = fetchCalls.find(c => c.url.includes('/rest/v1/students') && c.options.method === 'PATCH');
    assert(patchCall, 'PATCH call to /rest/v1/students must be dispatched');
    assert(patchCall.url.includes('id=eq.uuid-11'), 'PATCH URL must target specific student user ID');
    assert.strictEqual(patchCall.options.headers['Authorization'], 'Bearer auth-jwt-token-11');
    assert.deepStrictEqual(JSON.parse(patchCall.options.body), { qualification: 'a-level' });

    const updatedProfile = engineEnv.auth.getProfile();
    assert.strictEqual(updatedProfile.qualification, 'a-level', 'In-memory profile qualification must be refreshed');
  });

  /* ── Case 12: Failed qualification update leaves displayed value unchanged ── */
  await runTest('Case 12: Failed qualification update leaves displayed value unchanged', async () => {
    const mockFetch = async (url, options = {}) => {
      if (url.includes('/rest/v1/students') && options.method === 'PATCH') {
        return mockResponse({
          ok: false,
          status: 400,
          json: { message: 'Database constraint violation' }
        });
      }
      if (url.includes('/rest/v1/students') && (!options.method || options.method === 'GET')) {
        return mockResponse({
          ok: true,
          status: 200,
          json: [{
            id: 'uuid-12',
            full_name: 'Original Student',
            qualification: 'o-level',
            service_terms_accepted: true
          }]
        });
      }
      return mockResponse({});
    };

    const initialStorage = {
      'st_auth_session': JSON.stringify({
        access_token: 'auth-jwt-token-12',
        refresh_token: 'refresh-token-12',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'uuid-12', email: 'orig@example.com' }
      })
    };

    const engineEnv = createAuthEngineEnvironment({ initialStorage, fetchFn: mockFetch });
    await engineEnv.auth.fetchStudentProfile();
    assert.strictEqual(engineEnv.auth.getProfile().qualification, 'o-level');

    let threw = false;
    try {
      await engineEnv.auth.updateQualification('a-level');
    } catch (err) {
      threw = true;
      assert(err.message.includes('Database constraint violation'));
    }
    assert(threw, 'updateQualification must reject on HTTP failure');
    assert.strictEqual(engineEnv.auth.getProfile().qualification, 'o-level', 'Profile qualification must remain unchanged');
  });

  /* ── Case 13: Repeated session events do not duplicate prompts or event listeners ── */
  await runTest('Case 13: Repeated session events do not duplicate prompts or event listeners', async () => {
    let authCallback = null;

    const authMock = {
      getUser: () => ({ id: 'usr-13', email: 'repeat@example.com' }),
      getProfile: () => ({ full_name: 'Repeat Student', service_terms_accepted: false, qualification: 'o-level' }),
      isConfigured: () => true,
      onAuthStateChange: (cb) => { authCallback = cb; }
    };

    const env = createAuthUIEnvironment({ authMock });

    // First session event (initial session restore)
    authCallback(
      { user: { id: 'usr-13', email: 'repeat@example.com' } },
      { full_name: 'Repeat Student', service_terms_accepted: false, qualification: 'o-level' }
    );
    const modalBackdrop = env.elements['st-auth-modal'];
    assert(modalBackdrop && modalBackdrop.classList.contains('st-active'), 'Initial session restore should trigger terms modal');

    // Simulate user closing the modal to continue browsing
    env.authUI.closeModal();
    assert(!modalBackdrop.classList.contains('st-active'), 'Modal closed');

    // Second session event (background token refresh or window refocus)
    authCallback(
      { user: { id: 'usr-13', email: 'repeat@example.com' } },
      { full_name: 'Repeat Student', service_terms_accepted: false, qualification: 'o-level' }
    );
    assert(!modalBackdrop.classList.contains('st-active'), 'Subsequent session event must NOT re-open the terms modal');
  });

  /* ── Case 14: Null or missing qualification displays explicit unselected state in Account drawer ── */
  await runTest('Case 14: Null or missing qualification displays explicit unselected state in Account drawer', async () => {
    const authMock = {
      getUser: () => ({ id: 'usr-14', email: 'noqual@example.com' }),
      getProfile: () => ({ full_name: 'No Qual Student', qualification: null, service_terms_accepted: true }),
      isConfigured: () => true,
      onAuthStateChange: () => {}
    };

    const env = createAuthUIEnvironment({ authMock });
    env.authUI.openModal('account');

    const qualSelect = env.elements['st-acc-qualification'];
    assert(qualSelect, 'Qualification select element must exist');
    assert.strictEqual(qualSelect.value, '', 'Missing qualification must render unselected empty state, not o-level');

    // When student selects o-level from unselected state, save button must appear
    qualSelect.value = 'o-level';
    await qualSelect.dispatchEvent('change');
    const saveQualBtn = env.elements['st-btn-save-qual'];
    assert.strictEqual(saveQualBtn.style.display, 'inline-block', 'Save button must be revealed upon choosing a qualification track');
  });

  /* ── Case 15: Auth.updateQualification() client validation strictly rejects non-allowed values ── */
  await runTest('Case 15: Auth.updateQualification() client validation strictly rejects non-allowed values', async () => {
    let patchDispatched = false;
    const mockFetch = async (url, options = {}) => {
      if (options.method === 'PATCH') {
        patchDispatched = true;
      }
      return mockResponse({});
    };

    const initialStorage = {
      'st_auth_session': JSON.stringify({
        access_token: 'auth-jwt-token-15',
        refresh_token: 'refresh-token-15',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'uuid-15', email: 'reject@example.com' }
      })
    };

    const engineEnv = createAuthEngineEnvironment({ initialStorage, fetchFn: mockFetch });

    const invalidTracks = ['gcse', 'ib', '', '   ', null, undefined, 'advanced'];
    for (const invalidVal of invalidTracks) {
      let threw = false;
      try {
        await engineEnv.auth.updateQualification(invalidVal);
      } catch (err) {
        threw = true;
        assert(err.message.includes('Invalid qualification track'), 'Error message must specify invalid track');
      }
      assert(threw, `updateQualification must reject "${invalidVal}"`);
    }

    assert.strictEqual(patchDispatched, false, 'No PATCH request should be dispatched for invalid qualification values');
  });

  /* ── Case 16: HTTP 403 with HTML or malformed body preserves question and does not open terms modal ── */
  await runTest('Case 16: HTTP 403 with HTML or malformed body preserves question and does not open terms modal', async () => {
    let openedTab = null;
    const authMock = {
      getValidAccessToken: async () => 'test-bearer-token',
      getUser: () => ({ id: 'usr-16', email: 'html403@example.com' })
    };
    const authUIMock = {
      openModal: (tab) => { openedTab = tab; }
    };

    // Return HTML / non-JSON error response from edge proxy
    const customFetch = async () => ({
      ok: false,
      status: 403,
      headers: { get: () => 'text/html' },
      json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
      text: async () => '<html><body>403 Forbidden: WAF block</body></html>'
    });

    const env = createWidgetEnvironment({ auth: authMock, authUI: authUIMock, fetchFn: customFetch });
    const input = env.elements['ai-chat-input'];
    const sendBtn = env.elements['ai-chat-send'];

    const testPrompt = 'Explain electromagnetic induction with Faraday and Lenz laws';
    input.value = testPrompt;

    await env.window.SmartTutorsAI.sendMessage(testPrompt);

    assert.strictEqual(input.value, testPrompt, 'Question must be preserved when non-JSON 403 occurs');
    assert.strictEqual(openedTab, null, 'Terms modal must NOT be opened for generic/HTML 403 without structured code');
    assert.strictEqual(input.disabled, false, 'Input must be re-enabled');
    assert.strictEqual(sendBtn.disabled, false, 'Send button must be re-enabled');
  });

  /* ── Case 17: HTTP 500 with HTML or malformed body preserves question, releases locks, and falls back cleanly ── */
  await runTest('Case 17: HTTP 500 with HTML or malformed body preserves question, releases locks, and falls back cleanly', async () => {
    const authMock = {
      getValidAccessToken: async () => 'test-bearer-token',
      getUser: () => ({ id: 'usr-17' })
    };

    // Return HTML 500 from upstream server
    const customFetch = async () => ({
      ok: false,
      status: 500,
      headers: { get: () => 'text/html' },
      json: async () => { throw new SyntaxError('Unexpected token <'); },
      text: async () => '<html><body>500 Internal Server Error</body></html>'
    });

    const env = createWidgetEnvironment({ auth: authMock, fetchFn: customFetch });
    const input = env.elements['ai-chat-input'];
    const sendBtn = env.elements['ai-chat-send'];

    const testPrompt = 'Calculate momentum before and after inelastic collision';
    input.value = testPrompt;

    await env.window.SmartTutorsAI.sendMessage(testPrompt);

    assert.strictEqual(input.value, testPrompt, 'Question must be preserved on 500 error');
    assert.strictEqual(input.disabled, false, 'Input must be unlocked');
    assert.strictEqual(sendBtn.disabled, false, 'Send button must be unlocked');
  });

  /* ── Case 18: Network failure during request preserves original question and releases UI locks ── */
  await runTest('Case 18: Network failure during request preserves original question and releases UI locks', async () => {
    const authMock = {
      getValidAccessToken: async () => 'test-bearer-token',
      getUser: () => ({ id: 'usr-18' })
    };

    const customFetch = async () => {
      throw new TypeError('Failed to fetch: net::ERR_INTERNET_DISCONNECTED');
    };

    const env = createWidgetEnvironment({ auth: authMock, fetchFn: customFetch });
    const input = env.elements['ai-chat-input'];
    const sendBtn = env.elements['ai-chat-send'];

    const testPrompt = 'State Newton second law of motion';
    input.value = testPrompt;

    await env.window.SmartTutorsAI.sendMessage(testPrompt);

    assert.strictEqual(input.value, testPrompt, 'Question must be preserved when fetch rejects with network failure');
    assert.strictEqual(input.disabled, false, 'Input must be re-enabled after network failure');
    assert.strictEqual(sendBtn.disabled, false, 'Send button must be re-enabled after network failure');
  });

  /* ── Case 19: Clicking terms-view Sign Out invokes Auth.signOut and closes modal ── */
  await runTest('Case 19: Clicking terms-view Sign Out invokes Auth.signOut and closes modal', async () => {
    let signOutCalled = 0;
    const authMock = {
      getUser: () => ({ id: 'usr-19', email: 'signout@example.com' }),
      getProfile: () => ({ full_name: 'Signout Student', service_terms_accepted: false }),
      isConfigured: () => true,
      onAuthStateChange: () => {},
      signOut: async () => { signOutCalled++; }
    };

    const env = createAuthUIEnvironment({ authMock });
    env.authUI.openModal('terms');

    const modalBackdrop = env.elements['st-auth-modal'];
    assert(modalBackdrop && modalBackdrop.classList.contains('st-active'), 'Modal must be active');

    const signoutBtn = env.elements['st-btn-terms-signout'];
    assert(signoutBtn, 'Terms Sign Out button must exist');
    await signoutBtn.click();

    assert.strictEqual(signOutCalled, 1, 'Auth.signOut must be called exactly once');
    assert(!modalBackdrop.classList.contains('st-active'), 'Modal must be closed after sign-out');
  });

  /* ── Case 20: Backdrop or close-button dismissal on terms view does not record terms consent ── */
  await runTest('Case 20: Backdrop or close-button dismissal on terms view does not record terms consent', async () => {
    let acceptTermsCalls = 0;
    const authMock = {
      getUser: () => ({ id: 'usr-20', email: 'dismiss@example.com' }),
      getProfile: () => ({ full_name: 'Dismiss Student', service_terms_accepted: false }),
      isConfigured: () => true,
      onAuthStateChange: () => {},
      acceptTerms: async () => { acceptTermsCalls++; }
    };

    const env = createAuthUIEnvironment({ authMock });

    // Test close button
    env.authUI.openModal('terms');
    const modalBackdrop = env.elements['st-auth-modal'];
    assert(modalBackdrop && modalBackdrop.classList.contains('st-active'));
    const closeBtn = env.elements['st-auth-close-btn'];
    assert(closeBtn, 'Close button must exist');
    await closeBtn.click();
    assert(!modalBackdrop.classList.contains('st-active'), 'Modal closed via close button');
    assert.strictEqual(acceptTermsCalls, 0, 'Consent must NOT be recorded via close button');

    // Test backdrop click
    env.authUI.openModal('terms');
    assert(modalBackdrop.classList.contains('st-active'));
    await modalBackdrop.dispatchEvent({ type: 'click', target: modalBackdrop });
    assert(!modalBackdrop.classList.contains('st-active'), 'Modal closed via backdrop click');
    assert.strictEqual(acceptTermsCalls, 0, 'Consent must NOT be recorded via backdrop click');
  });

  /* ── Case 21: Qualification Save button click with empty selection rejects update and shows validation error ── */
  await runTest('Case 21: Qualification Save button click with empty selection rejects update and shows validation error', async () => {
    let updateQualificationCalls = 0;
    const authMock = {
      getUser: () => ({ id: 'usr-21', email: 'emptyqual@example.com' }),
      getProfile: () => ({ full_name: 'Empty Qual Student', qualification: null, service_terms_accepted: true }),
      isConfigured: () => true,
      onAuthStateChange: () => {},
      updateQualification: async (val) => {
        updateQualificationCalls++;
        return val;
      }
    };

    const env = createAuthUIEnvironment({ authMock });
    env.authUI.openModal('account');

    const qualSelect = env.elements['st-acc-qualification'];
    const saveQualBtn = env.elements['st-btn-save-qual'];
    const alertEl = env.elements['st-auth-alert'];

    assert(qualSelect, 'Qualification select element must exist');
    assert(saveQualBtn, 'Qualification Save button must exist');
    assert(alertEl, 'Alert element must exist');
    assert.strictEqual(qualSelect.value, '', 'Select must be in empty unselected state initially');

    // 1. Dispatch real click event on Save button while select value is empty
    await saveQualBtn.click();

    // Verify invalid selection is rejected without network dispatch
    assert.strictEqual(updateQualificationCalls, 0, 'No qualification update PATCH must be dispatched for empty selection');
    assert(alertEl.textContent.includes('Please select a valid qualification track'), 'Clear validation message must be displayed');
    assert(alertEl.className.includes('error'), 'Alert must have error class');

    // 2. Verify UI remains fully usable to select and save a valid track afterward
    qualSelect.value = 'a-level';
    await qualSelect.dispatchEvent('change');
    assert.strictEqual(saveQualBtn.style.display, 'inline-block', 'Save button must be revealed upon choosing a valid track');

    await saveQualBtn.click();
    assert.strictEqual(updateQualificationCalls, 1, 'Auth.updateQualification must be called once with valid track');
    assert(alertEl.textContent.includes('Qualification updated successfully'), 'Success message must be displayed');
    assert(alertEl.className.includes('success'), 'Alert must have success class');
    assert.strictEqual(saveQualBtn.style.display, 'none', 'Save button must be hidden after successful save');
  });

  /* ── Case 22: Initial profile fetch rejection does not crash UI, preserves unverified consent, and offers recovery path ── */
  await runTest('Case 22: Initial profile fetch rejection does not crash UI, preserves unverified consent, and offers recovery path', async () => {
    // 1. Verify engine layer: fetchStudentProfile() handles network/server error without unhandled rejection
    const mockNetworkErrorFetch = async (url) => {
      if (url.includes('/rest/v1/students')) {
        throw new TypeError('Failed to fetch: net::ERR_CONNECTION_REFUSED');
      }
      return mockResponse({});
    };

    const engineStorage = {
      'st_auth_session': JSON.stringify({
        access_token: 'auth-jwt-token-22',
        refresh_token: 'refresh-token-22',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'usr-22', email: 'errstudent@example.com', email_confirmed_at: '2026-10-01T00:00:00Z' }
      })
    };

    const engineEnv = createAuthEngineEnvironment({ initialStorage: engineStorage, fetchFn: mockNetworkErrorFetch });
    let engineProfileResult = null;
    let engineThrew = false;
    try {
      engineProfileResult = await engineEnv.auth.fetchStudentProfile();
    } catch (_err) {
      engineThrew = true;
    }
    assert.strictEqual(engineThrew, false, 'fetchStudentProfile must catch network errors and not throw unhandled exception');
    assert.strictEqual(engineProfileResult, null, 'fetchStudentProfile must return null on failure');
    assert.strictEqual(engineEnv.auth.getProfile(), null, 'Profile in memory must remain null');

    // 2. Verify DOM & UI layer: Auth UI handles null profile safely during initialization
    let acceptTermsCalled = 0;
    let authCallback = null;
    const authMock = {
      getUser: () => ({ id: 'usr-22', email: 'errstudent@example.com', email_confirmed_at: '2026-10-01T00:00:00Z' }),
      getProfile: () => null, // Profile fetch failed
      isConfigured: () => true,
      onAuthStateChange: (cb) => { authCallback = cb; },
      acceptTerms: async () => { acceptTermsCalled++; }
    };

    let uiInitThrew = false;
    let env = null;
    try {
      env = createAuthUIEnvironment({ authMock });
      // Trigger auth state change with null profile (simulating failed profile fetch on startup)
      authCallback(
        { user: { id: 'usr-22', email: 'errstudent@example.com', email_confirmed_at: '2026-10-01T00:00:00Z' } },
        null
      );
    } catch (_err) {
      uiInitThrew = true;
    }

    assert.strictEqual(uiInitThrew, false, 'Authentication UI initialization must not throw when profile fetch fails');

    // Verify navbar remains fully usable with fallback identity
    const pillBtn = env.elements['st-pill-btn'];
    assert(pillBtn, 'Account pill button must be mounted in navbar');
    assert(pillBtn.textContent.includes('errstudent'), 'Navbar pill must fall back cleanly to email prefix');
    assert(!pillBtn.textContent.includes('Terms Pending'), 'Navbar pill should not display false pending banner without verified profile');

    // Click account pill to open drawer
    await pillBtn.click();
    const modalBackdrop = env.elements['st-auth-modal'];
    assert(modalBackdrop && modalBackdrop.classList.contains('st-active'), 'Modal must open smoothly');

    // Verify missing profile data is NOT represented as verified consent
    const termsStatusEl = env.elements['st-acc-terms-status'];
    assert(termsStatusEl, 'Terms status indicator must exist');
    assert.strictEqual(termsStatusEl.textContent, '⚠ Pending Acceptance', 'Missing profile data must NOT be represented as verified consent');
    assert.notStrictEqual(termsStatusEl.textContent, '✓ Accepted', 'Terms must not be falsely marked as accepted');

    // Verify clear recovery path: student with confirmed email can accept terms directly
    const termsActionBox = env.elements['st-terms-action-box'];
    assert(termsActionBox, 'Terms action box must exist');
    assert.strictEqual(termsActionBox.style.display, 'block', 'Recovery terms action box must be displayed for student to unlock tutoring');

    const acceptBtn = env.elements['st-btn-accept-terms'];
    assert(acceptBtn, 'Accept terms recovery button must exist');
    await acceptBtn.click();
    assert.strictEqual(acceptTermsCalled, 1, 'Student must be able to invoke acceptTerms() as a recovery path');
  });

  console.log(`\n================================================================`);
  console.log(`SmartTutors Phase 2.19 Regression Tests: ${testsPassed} passed, ${testsFailed} failed`);
  console.log(`================================================================\n`);

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
