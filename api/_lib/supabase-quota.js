/* ================================================================
   SmartTutors — Supabase Quota & Two-Phase Reservation Manager
   Phase 2 & Phase 2.2: Secure server-side identity validation,
   HMAC-signed guest cookies, and two-phase quota reservation.
   Adheres strictly to the migration proposal:
   - reserve_student_ai_question (5 questions/Karachi date)
   - reserve_guest_ai_question (1 question / 64-hex SHA-256 cookie hash)
   - finalize_ai_question_reservation (releases hold on failure, commits on success)
   ================================================================ */
'use strict';

const crypto = require('crypto');

/**
 * Parse standard HTTP Cookie header into key-value pairs
 */
function parseCookies(cookieHeader) {
  const map = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return map;
  const pairs = cookieHeader.split(';');
  for (let i = 0; i < pairs.length; i++) {
    const idx = pairs[i].indexOf('=');
    if (idx > 0) {
      const key = pairs[i].substring(0, idx).trim();
      const val = pairs[i].substring(idx + 1).trim();
      try {
        map[key] = decodeURIComponent(val);
      } catch (_e) {
        map[key] = val;
      }
    }
  }
  return map;
}

/**
 * Sign raw 64-hex guest ID using HMAC-SHA256
 */
function signGuestIdentifier(rawGuestId, secret) {
  if (!secret) return rawGuestId;
  const sig = crypto.createHmac('sha256', secret).update(rawGuestId).digest('hex');
  return `${rawGuestId}.${sig}`;
}

/**
 * Verify signed guest cookie using constant-time comparison
 * Returns validated raw 64-hex guest ID or null if forged/malformed
 */
function verifyGuestIdentifier(cookieVal, secret) {
  if (!cookieVal || typeof cookieVal !== 'string') return null;
  const trimmed = cookieVal.trim();

  if (secret) {
    const parts = trimmed.split('.');
    if (parts.length === 2) {
      const [rawId, sig] = parts;
      if (/^[0-9a-fA-F]{64}$/.test(rawId) && /^[0-9a-fA-F]{64}$/.test(sig)) {
        const expectedSig = crypto.createHmac('sha256', secret).update(rawId).digest('hex');
        try {
          const sigBuf = Buffer.from(sig, 'hex');
          const expBuf = Buffer.from(expectedSig, 'hex');
          if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
            return rawId.toLowerCase();
          }
        } catch (_e) {
          return null;
        }
      }
    }
    return null;
  }

  // If no secret configured (e.g. offline testing), accept valid 64-hex string
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return null;
}

/**
 * Extract or generate opaque cryptographically random guest ID.
 * Employs HMAC-SHA256 signature verification when a secret is provided.
 *
 * NOTE ON SECURITY LIMITATIONS (SEC-03):
 * Cryptographic cookie signing guarantees that the guest identifier was minted
 * by this server and has not been forged, tampered with, or manipulated by the client.
 * However, cookie-based tracking CANNOT provide Sybil resistance or guaranteed
 * one-person-one-question enforcement, because an adversary can delete their cookie
 * or clear local storage to receive a new guest identifier. It serves as UI friction
 * for honest casual users.
 */
function getOrCreateGuestIdentifier(req, secretKey) {
  const cookieHeader = req && req.headers ? req.headers.cookie : '';
  const cookies = parseCookies(cookieHeader);
  const existingCookieVal = cookies['st_guest_id'];
  const secret = secretKey || process.env.GUEST_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;

  if (existingCookieVal) {
    const verifiedId = verifyGuestIdentifier(existingCookieVal, secret);
    if (verifiedId) {
      return {
        guestId: verifiedId,
        cookieValue: existingCookieVal,
        isNew: false
      };
    }
  }

  // Generate 256-bit cryptographically secure random token (64 hex characters)
  const newId = crypto.randomBytes(32).toString('hex');
  const signedCookieVal = signGuestIdentifier(newId, secret);

  return {
    guestId: newId,
    cookieValue: signedCookieVal,
    isNew: true
  };
}

/**
 * Format HttpOnly, SameSite=Lax cookie string for guest tracking
 */
function createGuestCookieHeader(cookieValue, isHttps) {
  const maxAge = 365 * 24 * 60 * 60; // 1 year
  let header = `st_guest_id=${encodeURIComponent(cookieValue)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  if (isHttps) {
    header += '; Secure';
  }
  return header;
}

/**
 * Hash guest ID using SHA-256 to produce exactly 64 lowercase hex characters
 */
function hashGuestIdentifier(guestId) {
  return crypto.createHash('sha256').update(String(guestId).trim()).digest('hex');
}

/**
 * Independently verify Supabase student JWT against Supabase GoTrue Auth
 * Validates token signature, issuer, expiry, and retrieves authenticated user object
 */
async function verifySupabaseToken(token, supabaseUrl, serviceRoleKey) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Missing token' };
  }

  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`;
  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        apikey: serviceRoleKey.trim()
      }
    });

    if (!res.ok) {
      return { valid: false, error: 'Token verification failed with status ' + res.status };
    }

    const user = await res.json();
    if (!user || !user.id) {
      return { valid: false, error: 'Invalid user payload from auth server' };
    }

    return { valid: true, user };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Execute PostgREST RPC using service-role credentials
 */
async function callSupabaseRpc(supabaseUrl, serviceRoleKey, rpcName, params) {
  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${encodeURIComponent(rpcName)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey.trim(),
      Authorization: `Bearer ${serviceRoleKey.trim()}`
    },
    body: JSON.stringify(params || {})
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_e) {
    // Non-JSON response
  }

  if (!res.ok) {
    const msg = (json && (json.message || json.error || json.hint)) || text || `RPC ${rpcName} failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = json;
    throw err;
  }

  return json;
}

/**
 * High-level question quota reservation coordinator
 * Handles both Authenticated Student and Guest requests
 */
async function reserveQuestionQuota({ req, subject, supabaseUrl, serviceRoleKey, isHttps }) {
  const authHeader = req && req.headers ? (req.headers.authorization || '') : '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

  // ── PATH A: Authenticated Student ──
  if (token) {
    const authResult = await verifySupabaseToken(token, supabaseUrl, serviceRoleKey);
    if (!authResult.valid) {
      return {
        allowed: false,
        status: 401,
        error: 'Invalid or expired session. Please sign in again.',
        code: 'invalid_token'
      };
    }

    const studentUser = authResult.user;

    // Defense-in-depth: Verify email confirmation
    if (!studentUser.email_confirmed_at) {
      return {
        allowed: false,
        status: 403,
        error: 'Please confirm your email address before using the AI tutor.',
        code: 'email_not_confirmed'
      };
    }

    const studentId = studentUser.id;

    try {
      const rpcResult = await callSupabaseRpc(supabaseUrl, serviceRoleKey, 'reserve_student_ai_question', {
        p_student_id: studentId,
        p_subject: subject
      });

      if (!rpcResult || rpcResult.allowed !== true) {
        const reason = (rpcResult && rpcResult.reason) || 'unknown';

        if (reason === 'daily_limit_reached') {
          return {
            allowed: false,
            status: 429,
            error: 'You have reached your daily limit of 5 free AI questions for today. Your quota resets at midnight PKT (Asia/Karachi).',
            code: 'daily_limit_reached',
            limit: 5,
            used: 5,
            remaining: 0
          };
        }

        if (reason === 'service_terms_not_accepted') {
          return {
            allowed: false,
            status: 403,
            error: 'You must accept the SmartTutors Terms of Service before using the AI tutor.',
            code: 'service_terms_not_accepted'
          };
        }

        if (reason === 'email_not_confirmed') {
          return {
            allowed: false,
            status: 403,
            error: 'Please confirm your email address before using the AI tutor.',
            code: 'email_not_confirmed'
          };
        }

        return {
          allowed: false,
          status: 403,
          error: 'Unable to reserve tutoring allowance: ' + reason,
          code: reason
        };
      }

      return {
        allowed: true,
        reservationId: rpcResult.reservation_id,
        isPremium: Boolean(rpcResult.is_premium),
        remaining: rpcResult.questions_remaining,
        tier: rpcResult.is_premium ? 'premium' : 'student'
      };
    } catch (rpcErr) {
      console.error('[SupabaseQuota] Student reservation RPC error:', rpcErr.message);
      return {
        allowed: false,
        status: 502,
        error: 'Unable to check quota allowance right now. Please try again in a moment.',
        code: 'rpc_error'
      };
    }
  }

  // ── PATH B: Guest User (Cookie-based allowance with HMAC integrity) ──
  const guestSecret = process.env.GUEST_COOKIE_SECRET || serviceRoleKey || null;
  const { guestId, cookieValue, isNew } = getOrCreateGuestIdentifier(req, guestSecret);
  const guestHash = hashGuestIdentifier(guestId);
  const cookieHeader = isNew ? createGuestCookieHeader(cookieValue, isHttps) : null;

  try {
    const rpcResult = await callSupabaseRpc(supabaseUrl, serviceRoleKey, 'reserve_guest_ai_question', {
      p_guest_id_hash: guestHash,
      p_subject: subject
    });

    if (!rpcResult || rpcResult.allowed !== true) {
      const reason = (rpcResult && rpcResult.reason) || 'unknown';

      if (reason === 'guest_limit_reached') {
        return {
          allowed: false,
          status: 429,
          error: 'You have used your 1 free guest question. Create a free student account to get 5 questions daily!',
          code: 'guest_limit_reached',
          limit: 1,
          remaining: 0,
          setCookie: cookieHeader
        };
      }

      return {
        allowed: false,
        status: 403,
        error: 'Guest quota error: ' + reason,
        code: reason,
        setCookie: cookieHeader
      };
    }

    return {
      allowed: true,
      reservationId: rpcResult.reservation_id,
      isPremium: false,
      remaining: rpcResult.questions_remaining,
      tier: 'guest',
      setCookie: cookieHeader
    };
  } catch (rpcErr) {
    console.error('[SupabaseQuota] Guest reservation RPC error:', rpcErr.message);
    return {
      allowed: false,
      status: 502,
      error: 'Unable to check guest quota. Please try again in a moment.',
      code: 'rpc_error',
      setCookie: cookieHeader
    };
  }
}

/**
 * Finalize reservation ticket:
 * success = true  -> marks 'committed', increments quota table
 * success = false -> marks 'released', quota untouched
 */
async function finalizeQuotaReservation({ supabaseUrl, serviceRoleKey, reservationId, success }) {
  if (!reservationId) return null;

  try {
    const result = await callSupabaseRpc(supabaseUrl, serviceRoleKey, 'finalize_ai_question_reservation', {
      p_reservation_id: reservationId,
      p_success: Boolean(success)
    });
    return result;
  } catch (err) {
    console.error('[SupabaseQuota] Finalization RPC error for reservation ' + reservationId + ':', err.message);
    return null;
  }
}

module.exports = {
  parseCookies,
  signGuestIdentifier,
  verifyGuestIdentifier,
  getOrCreateGuestIdentifier,
  createGuestCookieHeader,
  hashGuestIdentifier,
  verifySupabaseToken,
  callSupabaseRpc,
  reserveQuestionQuota,
  finalizeQuotaReservation
};
