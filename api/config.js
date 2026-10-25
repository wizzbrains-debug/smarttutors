'use strict';

/**
 * SmartTutors — Public Frontend Configuration Endpoint (Phase 1)
 *
 * Exposes exclusively public browser configuration (Supabase URL & anon key).
 * Server-only secrets (service role key, Gemini key, guest cookie secret)
 * are NEVER accessed, logged, or returned by this endpoint.
 */

function isValidSupabaseUrl(urlStr) {
  if (typeof urlStr !== 'string') return false;
  const trimmed = urlStr.trim();
  if (!trimmed.startsWith('https://')) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch (_e) {
    return false;
  }
}

function isValidAnonKey(keyStr) {
  if (typeof keyStr !== 'string') return false;
  const trimmed = keyStr.trim();
  return trimmed.length >= 20 && !/\s/.test(trimmed);
}

module.exports = async function handler(req, res) {
  // Enforce HTTP GET method only
  if (!req || req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const status = 405;
    if (typeof res.status === 'function') res.status(status);
    else res.statusCode = status;
    const body = { error: 'Method not allowed. Use GET.', configured: false };
    if (typeof res.json === 'function') return res.json(body);
    return res.end(JSON.stringify(body));
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const rawUrl = process.env.SUPABASE_URL;
  const rawKey = process.env.SUPABASE_ANON_KEY;

  if (isValidSupabaseUrl(rawUrl) && isValidAnonKey(rawKey)) {
    // Short edge cache prevents stale values while keeping edge latency low
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');
    const cleanedUrl = rawUrl.trim().replace(/\/+$/, '');
    const cleanedKey = rawKey.trim();
    const payload = {
      supabaseUrl: cleanedUrl,
      supabaseAnonKey: cleanedKey,
      configured: true
    };
    if (typeof res.status === 'function') res.status(200);
    else res.statusCode = 200;
    if (typeof res.json === 'function') return res.json(payload);
    return res.end(JSON.stringify(payload));
  }

  // Unconfigured or invalid environment: do not cache, fail closed gracefully
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const payload = {
    supabaseUrl: '',
    supabaseAnonKey: '',
    configured: false
  };
  if (typeof res.status === 'function') res.status(200);
  else res.statusCode = 200;
  if (typeof res.json === 'function') return res.json(payload);
  return res.end(JSON.stringify(payload));
};
