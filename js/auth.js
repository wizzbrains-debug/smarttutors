/**
 * SmartTutors — Client Authentication & Account Management (Phase 2 & Phase 2.2)
 * Manages Supabase Auth, session lifecycle, token refresh, terms acceptance, and student profile.
 * Security: Zero privileged keys in browser; passes Bearer tokens for server verification.
 */
(function (window, document) {
  'use strict';

  /* ── Dynamic Configuration Readers (Phase 1 In-Memory Bootstrap) ── */
  let inMemorySupabaseUrl = '';
  let inMemorySupabaseAnonKey = '';
  let configPromise = null;

  function getSupabaseUrl() {
    return (inMemorySupabaseUrl || window.SMARTTUTORS_SUPABASE_URL || '').replace(/\/+$/, '');
  }

  function getSupabaseAnonKey() {
    return inMemorySupabaseAnonKey || window.SMARTTUTORS_SUPABASE_ANON_KEY || '';
  }

  function isConfigured() {
    return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
  }

  /**
   * Fetches public Supabase configuration from /api/config with in-flight mutex.
   * Keeps configuration exclusively in-memory; never writes secrets to storage.
   */
  async function ensureConfig() {
    if (isConfigured()) {
      return true;
    }

    if (configPromise) {
      return configPromise;
    }

    configPromise = (async () => {
      try {
        const res = await fetch('/api/config', {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) {
          return false;
        }
        const data = await res.json();
        if (
          data &&
          data.configured === true &&
          typeof data.supabaseUrl === 'string' &&
          data.supabaseUrl.trim().startsWith('https://') &&
          typeof data.supabaseAnonKey === 'string' &&
          data.supabaseAnonKey.trim().length >= 20
        ) {
          inMemorySupabaseUrl = data.supabaseUrl.trim().replace(/\/+$/, '');
          inMemorySupabaseAnonKey = data.supabaseAnonKey.trim();
          return true;
        }
        return false;
      } catch (_err) {
        return false;
      } finally {
        configPromise = null;
      }
    })();

    return configPromise;
  }

  const STORAGE_KEY = 'st_auth_session';

  /* ── State ── */
  let currentSession = null;
  let currentProfile = null;
  let refreshPromise = null;
  const authListeners = [];

  function onAuthStateChange(fn) {
    if (typeof fn === 'function') {
      authListeners.push(fn);
      // Immediately notify with current state
      fn(currentSession, currentProfile);
    }
  }

  function notifyAuthListeners() {
    for (let i = 0; i < authListeners.length; i++) {
      try {
        authListeners[i](currentSession, currentProfile);
      } catch (err) {
        console.error('[SmartTutors Auth] Listener error:', err);
      }
    }
  }

  /* ── Session Storage (tokens only; never passwords or server keys) ── */
  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      // If access token is expired but valid refresh token exists, retain for refresh
      if (parsed.expires_at && (Date.now() / 1000) > (parsed.expires_at - 60)) {
        if (!parsed.refresh_token) {
          localStorage.removeItem(STORAGE_KEY);
          return null;
        }
      }
      return parsed;
    } catch (_err) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function getActiveSession() {
    if (!currentSession) {
      currentSession = loadSession();
    }
    return currentSession;
  }

  function saveSession(session) {
    currentSession = session;
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY);
      currentProfile = null;
    }
    notifyAuthListeners();
  }

  /* ── Low-Level Supabase REST Client ── */
  async function supabaseRequest(path, options = {}) {
    if (!isConfigured()) {
      await ensureConfig();
    }
    const supabaseUrl = getSupabaseUrl();
    const supabaseAnonKey = getSupabaseAnonKey();

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase client is not configured on this site.');
    }

    const headers = Object.assign(
      {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey
      },
      options.headers || {}
    );

    const session = getActiveSession();
    // Auto-attach Bearer token if not explicitly provided or suppressed
    if (headers.Authorization === undefined && session && session.access_token) {
      headers.Authorization = 'Bearer ' + session.access_token;
    } else if (headers.Authorization === '') {
      delete headers.Authorization;
    }

    const res = await fetch(supabaseUrl + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
    });

    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const msg = (data && (data.msg || data.error_description || data.message || data.error)) || 'Auth request failed';
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  /* ── Session Refresh (SEC-04) ── */
  /**
   * Refreshes access token using refresh_token grant.
   * Guarantees a single in-flight Promise mutex to prevent concurrent refresh races.
   */
  async function refreshSession() {
    if (!isConfigured()) return null;
    const session = getActiveSession();
    if (!session || !session.refresh_token) {
      saveSession(null);
      return null;
    }

    // In-flight mutex: reuse active refresh promise
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      try {
        const data = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          headers: {
            Authorization: '' // Do not send expired access token
          },
          body: {
            refresh_token: session.refresh_token
          }
        });

        if (data && data.access_token) {
          const newSession = {
            access_token: data.access_token,
            refresh_token: data.refresh_token || session.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
            user: data.user || session.user
          };
          saveSession(newSession);
          return newSession;
        }

        // Invalid response payload from server; clear session
        saveSession(null);
        return null;
      } catch (err) {
        console.warn('[SmartTutors Auth] Session refresh failed:', err.message);
        // Expired or revoked refresh token: clear invalid session so user can sign in again
        saveSession(null);
        return null;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  /**
   * Asynchronously retrieves a valid, non-expired access token.
   * Proactively triggers refresh if token expires in less than 60 seconds.
   */
  async function getValidAccessToken() {
    if (!isConfigured()) {
      await ensureConfig();
    }
    const session = getActiveSession();
    if (!session) return null;

    if (session.expires_at && (Date.now() / 1000) > (session.expires_at - 60)) {
      if (session.refresh_token) {
        const refreshed = await refreshSession();
        return refreshed ? refreshed.access_token : null;
      }
      saveSession(null);
      return null;
    }

    return session.access_token || null;
  }

  /* ── Student Profile & Terms Fetcher ── */
  async function fetchStudentProfile() {
    const session = getActiveSession();
    if (!session || !session.user || !session.user.id) {
      currentProfile = null;
      return null;
    }

    try {
      // Ensure token is fresh before querying profile
      await getValidAccessToken();
      const current = getActiveSession();
      if (!current) return null;

      const rows = await supabaseRequest('/rest/v1/students?id=eq.' + encodeURIComponent(current.user.id) + '&select=*', {
        method: 'GET'
      });
      if (Array.isArray(rows) && rows.length > 0) {
        currentProfile = rows[0];
      } else {
        currentProfile = null;
      }
      notifyAuthListeners();
      return currentProfile;
    } catch (err) {
      console.warn('[SmartTutors Auth] Unable to fetch student profile:', err.message);
      return null;
    }
  }

  /* ── Auth API ── */

  /**
   * Register a new student account
   */
  async function signUp({ email, password, fullName, mobile, qualification, termsAccepted, marketingConsent }) {
    if (!termsAccepted) {
      throw new Error('You must accept the SmartTutors Terms of Service to create an account.');
    }

    const payload = {
      email: email.trim().toLowerCase(),
      password: password,
      data: {
        full_name: (fullName || '').trim(),
        mobile: mobile ? mobile.trim() : null,
        qualification: (qualification || 'o-level').toLowerCase()
      }
    };

    const data = await supabaseRequest('/auth/v1/signup', {
      method: 'POST',
      body: payload
    });

    if (data.session) {
      saveSession(data.session);
      if (data.user && data.user.email_confirmed_at) {
        try {
          await acceptTerms();
        } catch (_tErr) {}
      }
      if (marketingConsent === true) {
        try {
          await updateMarketingConsent(true);
        } catch (_mErr) {}
      }
      await fetchStudentProfile();
    }

    return {
      user: data.user || data,
      session: data.session,
      needsEmailConfirmation: !(data.user && data.user.email_confirmed_at)
    };
  }

  /**
   * Sign in existing student with email and password
   */
  async function signIn({ email, password }) {
    const data = await supabaseRequest('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: {
        email: email.trim().toLowerCase(),
        password: password
      }
    });

    if (data.access_token) {
      const session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
        user: data.user
      };
      saveSession(session);
      await fetchStudentProfile();
      return session;
    }

    throw new Error('Invalid login response from authentication server.');
  }

  /**
   * Sign out current student
   */
  async function signOut() {
    try {
      const session = getActiveSession();
      if (session && session.access_token) {
        await supabaseRequest('/auth/v1/logout', { method: 'POST' });
      }
    } catch (_err) {
      // Ignore network errors on signout
    } finally {
      saveSession(null);
    }
  }

  /**
   * Explicitly accept Terms of Service via trusted RPC
   */
  async function acceptTerms() {
    if (!getActiveSession()) throw new Error('Not authenticated.');
    await getValidAccessToken();
    const result = await supabaseRequest('/rest/v1/rpc/accept_service_terms', {
      method: 'POST',
      body: {}
    });
    await fetchStudentProfile();
    return result;
  }

  /**
   * Update qualification track via RLS-protected students table (o-level or a-level)
   */
  async function updateQualification(qualification) {
    const session = getActiveSession();
    if (!session || !session.user) throw new Error('Not authenticated.');
    const normalized = (qualification || '').trim().toLowerCase();
    if (normalized !== 'o-level' && normalized !== 'a-level') {
      throw new Error('Invalid qualification track. Must be "o-level" or "a-level".');
    }
    await getValidAccessToken();
    await supabaseRequest('/rest/v1/students?id=eq.' + encodeURIComponent(session.user.id), {
      method: 'PATCH',
      headers: {
        Prefer: 'return=representation'
      },
      body: {
        qualification: normalized
      }
    });
    await fetchStudentProfile();
    return normalized;
  }

  /**
   * Update marketing consent via RLS-protected students table
   */
  async function updateMarketingConsent(consent) {
    const session = getActiveSession();
    if (!session || !session.user) throw new Error('Not authenticated.');
    await getValidAccessToken();
    await supabaseRequest('/rest/v1/students?id=eq.' + encodeURIComponent(session.user.id), {
      method: 'PATCH',
      headers: {
        Prefer: 'return=representation'
      },
      body: {
        marketing_consent: Boolean(consent)
      }
    });
    await fetchStudentProfile();
  }

  /**
   * Synchronous getter for backward compatibility
   */
  function getAccessToken() {
    const session = getActiveSession();
    if (!session) return null;
    if (session.expires_at && (Date.now() / 1000) > (session.expires_at - 30)) {
      if (session.refresh_token) {
        refreshSession().catch(() => {});
      }
      return null;
    }
    return session.access_token || null;
  }

  function getUser() {
    const session = getActiveSession();
    return session ? session.user : null;
  }

  function getProfile() {
    return currentProfile;
  }

  function isAuthenticated() {
    const session = getActiveSession();
    return Boolean(session && session.access_token);
  }

  /* ── Initializer ── */
  async function init() {
    if (!isConfigured()) {
      await ensureConfig();
    }
    currentSession = loadSession();
    if (currentSession) {
      // If access token is expired but refresh token exists, proactively refresh
      if (currentSession.expires_at && (Date.now() / 1000) > (currentSession.expires_at - 60)) {
        if (currentSession.refresh_token && isConfigured()) {
          try {
            await refreshSession();
            await fetchStudentProfile();
          } catch (_e) {
            // refreshSession clears session on fatal refresh errors
          }
        } else if (!currentSession.refresh_token) {
          saveSession(null);
        }
      } else if (isConfigured()) {
        try {
          await fetchStudentProfile();
        } catch (_e) {}
      }
    }
    notifyAuthListeners();
  }

  // Initialize on script load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── Export Public API ── */
  window.SmartTutorsAuth = {
    isConfigured,
    ensureConfig,
    onAuthStateChange,
    signUp,
    signIn,
    signOut,
    acceptTerms,
    updateQualification,
    updateMarketingConsent,
    getAccessToken,
    getValidAccessToken,
    refreshSession,
    getUser,
    getProfile,
    isAuthenticated,
    fetchStudentProfile
  };

})(window, document);
