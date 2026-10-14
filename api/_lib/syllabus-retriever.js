/**
 * SmartTutors — Official Cambridge Syllabus Retrieval Module
 * 
 * Provides dependency-free, bounded grounding context for Cambridge O Level Physics 5054.
 * Integrates into serverless function without external vector databases.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let cachedPhysicsDataset = null;

/**
 * Loads the Physics 5054 dataset with resilient fallback for Vercel serverless bundling
 */
function loadPhysicsDataset() {
  if (cachedPhysicsDataset) return cachedPhysicsDataset;
  try {
    // 1. Primary serverless bundle location (within api/_lib/)
    const bundledLibPath = path.join(__dirname, 'physics-5054-2026-2028.json');
    if (fs.existsSync(bundledLibPath)) {
      const raw = fs.readFileSync(bundledLibPath, 'utf8');
      cachedPhysicsDataset = JSON.parse(raw);
      return cachedPhysicsDataset;
    }

    // 2. Local repository path (data/syllabus/)
    const repoPath = path.join(__dirname, '..', '..', 'data', 'syllabus', 'physics-5054-2026-2028.json');
    if (fs.existsSync(repoPath)) {
      const raw = fs.readFileSync(repoPath, 'utf8');
      cachedPhysicsDataset = JSON.parse(raw);
      return cachedPhysicsDataset;
    }
  } catch (err) {
    console.error('[syllabus-retriever] Failed to load physics 5054 dataset:', err.message);
  }
  return cachedPhysicsDataset;
}

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'cannot', 'could', 'couldn', 'did', 'didn', 'do', 'does', 'doesn', 'doing', 'don', 'down',
  'during', 'each', 'explain', 'few', 'for', 'from', 'further', 'had', 'hadn', 'has', 'hasn', 'have',
  'haven', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i',
  'if', 'in', 'into', 'is', 'isn', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my',
  'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought',
  'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'shouldn', 'so', 'some',
  'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn',
  'we', 'were', 'weren', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with',
  'won', 'would', 'wouldn', 'you', 'your', 'yours', 'yourself', 'yourselves', 'tell', 'give', 'help'
]);

/**
 * Normalizes query string for matching into content tokens excluding stop words
 * @param {string} text
 * @returns {{ allTokens: Array<string>, contentTokens: Array<string> }}
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return { allTokens: [], contentTokens: [] };
  const allTokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s.\/–-]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1);

  const contentTokens = allTokens.filter(t => t.length > 2 && !STOP_WORDS.has(t));
  return { allTokens, contentTokens };
}

/**
 * Retrieve verified syllabus objectives for a given subject and query
 * @param {string} subject - E.g. 'physics'
 * @param {string} query - Student question
 * @param {Object} [options]
 * @param {number} [options.maxResults=3]
 * @returns {{ objectives: Array<Object>, formattedContext: string, metadata: Object|null }}
 */
function retrieveSyllabusContext(subject, query, options = {}) {
  const maxResults = Math.min(options.maxResults || 3, 3); // Hard cap at 3
  const normalizedSubject = (subject || '').trim().toLowerCase();

  // Currently official grounding is ingested exclusively for Physics 5054
  if (normalizedSubject !== 'physics') {
    return {
      objectives: [],
      formattedContext: '',
      metadata: null,
      note: 'Verified syllabus grounding currently implemented exclusively for Cambridge O Level Physics 5054.'
    };
  }

  const dataset = loadPhysicsDataset();
  if (!dataset || !dataset.topics) {
    return {
      objectives: [],
      formattedContext: '',
      metadata: null,
      error: 'Physics 5054 dataset unavailable.'
    };
  }

  const queryLower = (query || '').toLowerCase().trim();
  const { allTokens, contentTokens } = tokenize(query);

  // If no substantial content tokens, avoid noisy matches
  if (contentTokens.length === 0 && !queryLower.includes('5054')) {
    return { objectives: [], formattedContext: '', metadata: dataset.meta };
  }

  const scoredObjectives = [];

  // Flatten and score objectives
  for (const topic of dataset.topics) {
    const topicTitleLower = topic.title.toLowerCase();
    const topicMatches = contentTokens.some(tok => topicTitleLower.includes(tok));

    for (const subtopic of topic.subtopics) {
      const subtopicTitleLower = subtopic.title.toLowerCase();
      const subtopicMatches = contentTokens.some(tok => subtopicTitleLower.includes(tok));

      for (const obj of subtopic.objectives) {
        let score = 0;
        const wordingLower = obj.wording.toLowerCase();
        const keywords = obj.keywords || [];
        const formula = (obj.formula || '').toLowerCase();
        const objId = obj.id.toLowerCase();
        const section = (obj.section || '').toLowerCase();

        // 1. Direct section or ID mention (High confidence)
        if (queryLower.includes(objId) || (section && queryLower.includes(section))) {
          score += 25;
        }

        // 2. Specific Ohm's law / circuit domain matches
        if (queryLower.includes("ohm") || queryLower.includes("resistance")) {
          if (objId.includes("4.2.4") || wordingLower.includes("ohm") || wordingLower.includes("resistance")) {
            score += 15;
          }
        }

        // 3. Formula match
        if (formula) {
          const cleanFormula = formula.replace(/\s+/g, '');
          const cleanQuery = queryLower.replace(/\s+/g, '');
          if (cleanQuery.includes(cleanFormula)) {
            score += 20;
          } else {
            const formulaParts = formula.split(/[\s=/×*+–-]+/).filter(t => t.length > 0 && !STOP_WORDS.has(t));
            const formulaMatchCount = formulaParts.filter(t => allTokens.includes(t)).length;
            if (formulaMatchCount >= 2) score += 10;
          }
        }

        // 4. Exact multi-word keyword phrase match
        for (const kw of keywords) {
          const kwLower = kw.toLowerCase();
          if (kwLower.includes(' ') && queryLower.includes(kwLower)) {
            score += 16;
          } else if (contentTokens.includes(kwLower)) {
            score += 8;
          }
        }

        // 5. Significant wording and concept coverage
        let matchedDistinctTokens = 0;
        for (const tok of contentTokens) {
          const wordRegex = new RegExp(`\\b${tok}\\b`, 'i');
          const inWording = wordRegex.test(wordingLower);
          const inFormula = formula.includes(tok);
          const inKw = keywords.some(k => k.toLowerCase().includes(tok));
          if (inWording || inFormula || inKw) {
            matchedDistinctTokens++;
            score += 3;
          }
        }

        // Bonus for proportional query concept coverage
        if (contentTokens.length > 0) {
          score += (matchedDistinctTokens / contentTokens.length) * 12;
        }

        // 6. Subtopic & topic context bonus
        if (matchedDistinctTokens > 0 || score > 0) {
          if (subtopicMatches) score += 4;
          if (topicMatches) score += 2;
        }

        // Disqualify isolated single-token hits when query contains 3 or more content terms
        if (contentTokens.length >= 3 && matchedDistinctTokens < 2 && !queryLower.includes(objId)) {
          score = 0;
        }

        // Hard minimum score threshold for candidate inclusion
        if (score >= 10) {
          scoredObjectives.push({
            score,
            topicTitle: topic.title,
            subtopicTitle: subtopic.title,
            pageReference: obj.page || subtopic.page_reference,
            objective: obj
          });
        }
      }
    }
  }

  if (scoredObjectives.length === 0) {
    return {
      objectives: [],
      formattedContext: '',
      metadata: dataset.meta
    };
  }

  // Sort descending by relevance score
  scoredObjectives.sort((a, b) => b.score - a.score);

  // Apply relative threshold: reject objectives with score < 55% of the top match
  const topScore = scoredObjectives[0].score;
  const filteredResults = scoredObjectives.filter(r => r.score >= Math.max(12, topScore * 0.55));

  const topResults = filteredResults.slice(0, maxResults);

  // Construct bounded syllabus grounding prompt block
  const lines = [
    `[Verified Cambridge O Level Physics (5054) Syllabus Grounding]`,
    `Official Source: 2026–2028 Syllabus (Version 2.0, Dec 2025). The student's question relates to the following verified learning objectives:`
  ];

  for (const item of topResults) {
    const o = item.objective;
    const formulaStr = o.formula ? ` [Formula: ${o.formula}]` : '';
    lines.push(`• Ref ${o.id} (Page ${item.pageReference}, ${item.subtopicTitle}): ${o.wording}${formulaStr}`);
  }

  lines.push(`Pedagogical Requirement: Reference these official principles in your Socratic guiding questions. Do not invent non-existent syllabus section numbers or raw final answers.`);

  let formattedContext = lines.join('\n');

  // Strict character hard limit (~1000 characters maximum)
  if (formattedContext.length > 1000) {
    formattedContext = formattedContext.substring(0, 997) + '...';
  }

  return {
    objectives: topResults.map(r => ({
      score: r.score,
      id: r.objective.id,
      section: r.subtopicTitle,
      page: r.pageReference,
      wording: r.objective.wording,
      formula: r.objective.formula || null
    })),
    formattedContext,
    metadata: dataset.meta
  };
}

module.exports = {
  loadPhysicsDataset,
  retrieveSyllabusContext
};
