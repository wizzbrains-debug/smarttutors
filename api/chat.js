/* ================================================================
   SmartTutors — Vercel Serverless AI Chat Endpoint (/api/chat)
   Calls Google Gemini API using native Node.js fetch.
   API key is read exclusively from process.env.GEMINI_API_KEY.
   ================================================================ */
'use strict';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const MAX_BODY_BYTES = 16384;          // 16 KB max raw request payload (supports bounded history)
const MAX_MESSAGE_LENGTH = 1500;       // Max length per message in chars
const MAX_HISTORY_MESSAGES = 8;        // Max prior conversation turns accepted
const MAX_TOTAL_HISTORY_CHARS = 6000;  // Max combined characters across history
const MAX_OUTPUT_TOKENS = 512;         // Cost & verbosity cap per tutoring turn
const REQUEST_TIMEOUT_MS = 8500;       // 8.5s upstream timeout (below Vercel 10s Hobby limit)

/* ── Basic per-IP rate limiting (per warm serverless instance) ── */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 15;
const MAX_RATE_LIMIT_ENTRIES = 500;
const ipRequestMap = new Map();

function pruneRateLimitMap(now) {
  if (ipRequestMap.size <= MAX_RATE_LIMIT_ENTRIES) return;
  for (const [key, entry] of ipRequestMap.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      ipRequestMap.delete(key);
    }
  }
  if (ipRequestMap.size > MAX_RATE_LIMIT_ENTRIES) {
    ipRequestMap.clear();
  }
}

function isRateLimited(ip) {
  const now = Date.now();
  pruneRateLimitMap(now);
  const entry = ipRequestMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipRequestMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

/* ── Same-origin / cross-site request guard ── */
function isCrossSiteRequest(req) {
  const headers = (req && req.headers) || {};
  const secFetchSite =
    typeof headers['sec-fetch-site'] === 'string'
      ? headers['sec-fetch-site'].trim().toLowerCase()
      : '';

  if (secFetchSite === 'cross-site') {
    return true;
  }

  const origin = typeof headers['origin'] === 'string' ? headers['origin'].trim() : '';
  const host = typeof headers['host'] === 'string' ? headers['host'].trim().toLowerCase() : '';

  if (origin && host) {
    try {
      const parsedOrigin = new URL(origin);
      const originHost = parsedOrigin.host.toLowerCase();
      const originHostname = parsedOrigin.hostname.toLowerCase();
      const isLocal =
        originHostname === 'localhost' ||
        originHostname === '127.0.0.1';
      if (originHost !== host && !isLocal) {
        return true;
      }
    } catch (_err) {
      return true;
    }
  }

  return false;
}

const { retrieveSyllabusContext } = require('./lib/syllabus-retriever');

/* ── Authoritative server-side Cambridge O-Level Socratic prompts ── */
const SUBJECT_PROMPTS = {
  chemistry: {
    label: 'Chemistry',
    syllabus: '5070',
    prompt:
      "You are an elite, specialized Cambridge O-Level Chemistry instructor (Syllabus 5070). You must strictly use the Socratic Method: NEVER give raw solutions, chemical formulas, or balanced equations directly. Instead, analyze the student's conceptual gap, reference the Chemistry 5070 syllabus topics (Atomic Structure, Bonding, Stoichiometry, Acids & Bases, Redox, Organic Chemistry, Energetics, Rates, Equilibria), and respond with a single, targeted question or helpful hint about the chemical components to guide them to find the answer themselves. Keep responses concise and encouraging. Respond ONLY using direct, plain text conversational paragraphs. NEVER output raw tool calls, interactive selection blocks, or metadata tags."
  },
  physics: {
    label: 'Physics',
    syllabus: '5054',
    prompt:
      "You are an elite, specialized Cambridge O-Level Physics instructor (Syllabus 5054). You must strictly use the Socratic Method: NEVER give raw solutions, final numerical answers, or fully derived equations directly. Instead, analyze the student's conceptual gap, reference the Physics 5054 syllabus topics (Motion & Forces, Thermal Physics, Waves, Electricity & Magnetism, Nuclear Physics, Space Physics), and respond with a single, targeted question or helpful hint about the physical principles involved to guide them to find the answer themselves. Keep responses concise and encouraging. Respond ONLY using direct, plain text conversational paragraphs. NEVER output raw tool calls, interactive selection blocks, or metadata tags."
  },
  math: {
    label: 'Mathematics',
    syllabus: '4024',
    prompt:
      "You are an elite, specialized Cambridge O-Level Mathematics instructor (Syllabus 4024). You must strictly use the Socratic Method: NEVER give raw solutions, final answers, or fully worked calculations directly. Instead, analyze the student's conceptual gap, reference the Mathematics 4024 syllabus topics (Number, Algebra, Geometry, Mensuration, Coordinate Geometry, Trigonometry, Vectors, Statistics, Probability, Matrices), and respond with a single, targeted question or helpful hint about the mathematical reasoning to guide them to find the answer themselves. Keep responses concise and encouraging. Respond ONLY using direct, plain text conversational paragraphs. NEVER output raw tool calls, interactive selection blocks, or metadata tags."
  },
  biology: {
    label: 'Biology',
    syllabus: '5090',
    prompt:
      "You are an elite, specialized Cambridge O-Level Biology instructor (Syllabus 5090). You must strictly use the Socratic Method: NEVER give raw definitions, diagram labels, or direct textbook answers. Instead, analyze the student's conceptual gap, reference the Biology 5090 syllabus topics (Cell Structure, Biological Molecules, Enzymes, Nutrition, Transport, Respiration, Reproduction, Inheritance, Ecology, Human Physiology), and respond with a single, targeted question or helpful hint about the biological mechanisms to guide them to find the answer themselves. Keep responses concise and encouraging. Respond ONLY using direct, plain text conversational paragraphs. NEVER output raw tool calls, interactive selection blocks, or metadata tags."
  },
  english: {
    label: 'English',
    syllabus: '1123',
    prompt:
      "You are an elite, specialized Cambridge O-Level English Language instructor (Syllabus 1123). You must strictly use the Socratic Method: NEVER write full essays, paragraphs, or direct model answers. Instead, analyze the student's writing gap, reference the English 1123 syllabus skills (Reading Comprehension, Summary Writing, Narrative Writing, Argumentative/Discursive Writing, Grammar & Vocabulary, Directed Writing), and respond with a single, targeted question or helpful hint about their language technique, structure, or expression to guide them to improve their answer themselves. Keep responses concise and encouraging. Respond ONLY using direct, plain text conversational paragraphs. NEVER output raw tool calls, interactive selection blocks, or metadata tags."
  }
};

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // 1. Validate HTTP method
  if (!req || req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // 2. Basic same-origin protection for browser requests
  if (isCrossSiteRequest(req)) {
    return res.status(403).json({ error: 'Cross-origin requests are not permitted.' });
  }

  // 3. Basic per-IP rate limit check (prefer trusted Vercel IP headers first)
  const headers = req.headers || {};
  const realIp = typeof headers['x-real-ip'] === 'string' ? headers['x-real-ip'].trim() : '';
  const forwarded = typeof headers['x-forwarded-for'] === 'string' ? headers['x-forwarded-for'] : '';
  const clientIp =
    realIp ||
    (forwarded ? forwarded.split(',')[0].trim() : '') ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown';

  if (isRateLimited(clientIp)) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a moment before asking another question.'
    });
  }

  // 4. Parse and validate request body & size (including Buffer handling)
  let body = req.body;
  if (Buffer.isBuffer(body)) {
    if (body.length > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'Request payload too large.' });
    }
    try {
      body = JSON.parse(body.toString('utf8'));
    } catch (_err) {
      return res.status(400).json({ error: 'Invalid JSON request body.' });
    }
  } else if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'Request payload too large.' });
    }
    try {
      body = JSON.parse(body);
    } catch (_err) {
      return res.status(400).json({ error: 'Invalid JSON request body.' });
    }
  } else if (body && typeof body === 'object' && !Array.isArray(body)) {
    let serialized = '';
    try {
      serialized = JSON.stringify(body);
    } catch (_err) {
      return res.status(400).json({ error: 'Invalid request body.' });
    }
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'Request payload too large.' });
    }
  } else {
    return res.status(400).json({ error: 'Missing or invalid request body.' });
  }

  // 5. Validate subject
  const rawSubject = typeof body.subject === 'string' ? body.subject.trim().toLowerCase() : '';
  const subjectConfig = SUBJECT_PROMPTS[rawSubject];
  if (!subjectConfig) {
    return res.status(400).json({
      error: 'Invalid subject. Supported subjects: chemistry, physics, math, biology, english.'
    });
  }

  // 6. Validate student message
  const rawMessage =
    typeof body.message === 'string'
      ? body.message
      : typeof body.content === 'string'
      ? body.content
      : '';
  const message = rawMessage.trim();

  if (!message) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: 'Message is too long. Maximum length is ' + MAX_MESSAGE_LENGTH + ' characters.'
    });
  }

  // 7. Validate optional bounded conversation history
  const contents = [];
  if (body.history !== undefined) {
    if (!Array.isArray(body.history)) {
      return res.status(400).json({ error: 'Invalid conversation history format.' });
    }
    if (body.history.length > MAX_HISTORY_MESSAGES) {
      return res.status(400).json({
        error: 'Conversation history exceeds maximum allowed turns (' + MAX_HISTORY_MESSAGES + ').'
      });
    }

    let totalHistoryChars = 0;
    for (let i = 0; i < body.history.length; i++) {
      const turn = body.history[i];
      if (!turn || typeof turn !== 'object') {
        return res.status(400).json({ error: 'Invalid turn in conversation history.' });
      }
      const role = turn.role;
      if (role !== 'user' && role !== 'model') {
        return res.status(400).json({
          error: 'Invalid history role. Allowed roles: user, model.'
        });
      }
      const turnText = typeof turn.text === 'string' ? turn.text.trim() : '';
      if (!turnText || turnText.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({
          error: 'Each history message must be between 1 and ' + MAX_MESSAGE_LENGTH + ' characters.'
        });
      }
      totalHistoryChars += turnText.length;
      if (totalHistoryChars > MAX_TOTAL_HISTORY_CHARS) {
        return res.status(400).json({
          error: 'Total conversation history size exceeds limit.'
        });
      }
      contents.push({
        role: role,
        parts: [{ text: turnText }]
      });
    }
  }

  // Append current student message as the final user turn
  contents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  // 8. Verify server-side API key configuration (never log or return the key)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return res.status(503).json({
      error: 'AI tutor service is not configured on the server.'
    });
  }

  // 9. Select Gemini model (supports server-side GEMINI_MODEL env override)
  const modelName =
    typeof process.env.GEMINI_MODEL === 'string' && process.env.GEMINI_MODEL.trim()
      ? process.env.GEMINI_MODEL.trim()
      : DEFAULT_GEMINI_MODEL;

  const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(modelName)}:generateContent`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const generationConfig = {
    temperature: 0.3,
    maxOutputTokens: MAX_OUTPUT_TOKENS
  };

  // Disable thinking token budget on Gemini 2.5 models so maxOutputTokens is reserved for visible tutoring hints
  if (modelName.startsWith('gemini-2.5')) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  // Grounding context retrieval for Cambridge syllabus (dependency-free serverless RAG)
  let systemInstructionText = subjectConfig.prompt;
  try {
    const syllabusContext = retrieveSyllabusContext(rawSubject, message);
    if (syllabusContext && syllabusContext.formattedContext) {
      systemInstructionText += '\n\n' + syllabusContext.formattedContext;
    }
  } catch (err) {
    console.warn('[api/chat] Syllabus retrieval skipped:', err.message);
  }

  try {
    const geminiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim()
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstructionText }]
        },
        contents: contents,
        generationConfig: generationConfig
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (geminiResponse.status === 429) {
      console.warn('[api/chat] Upstream Gemini rate limit (429)');
      return res.status(429).json({
        error: 'AI tutor rate limit reached. Please wait a few seconds and try again.'
      });
    }

    if (!geminiResponse.ok) {
      console.error('[api/chat] Upstream Gemini HTTP error status:', geminiResponse.status);
      return res.status(502).json({
        error: 'AI tutor service is temporarily unavailable.'
      });
    }

    const data = await geminiResponse.json();

    // Check for prompt or candidate safety blocks
    const blockReason = data && data.promptFeedback && data.promptFeedback.blockReason;
    const candidate = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
    const finishReason = candidate && candidate.finishReason;

    if (blockReason || finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
      const safetyReply =
        'I can only assist with safe, syllabus-aligned Cambridge O-Level study questions. Could you rephrase your question to focus on a specific syllabus concept?';
      if (body.stream === true) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.write('data: ' + JSON.stringify({ type: 'content', content: safetyReply }) + '\n\n');
        return res.end();
      }
      return res.status(200).json({
        reply: safetyReply,
        subject: rawSubject
      });
    }

    const parts =
      candidate && candidate.content && Array.isArray(candidate.content.parts)
        ? candidate.content.parts
        : [];

    // Exclude internal thought parts (part.thought === true) from student-visible output
    const reply = parts
      .filter(function (part) {
        return part && part.thought !== true;
      })
      .map(function (part) {
        return typeof part.text === 'string' ? part.text : '';
      })
      .join('')
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: 'Could not generate a tutoring response for that prompt. Please rephrase your question.'
      });
    }

    if (body.stream === true) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.write('data: ' + JSON.stringify({ type: 'content', content: reply }) + '\n\n');
      return res.end();
    }

    return res.status(200).json({
      reply: reply,
      subject: rawSubject
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err && err.name === 'AbortError') {
      console.warn('[api/chat] Upstream Gemini request timed out after ' + REQUEST_TIMEOUT_MS + 'ms');
      return res.status(504).json({
        error: 'AI tutor request timed out. Please try again.'
      });
    }
    console.error('[api/chat] Upstream fetch failed:', err && err.code ? err.code : 'network_error');
    return res.status(502).json({
      error: 'Unable to reach the AI tutor service.'
    });
  }
};
