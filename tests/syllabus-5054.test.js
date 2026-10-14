/**
 * Automated Verification Suite for Cambridge O Level Physics 5054 Syllabus Grounding & RAG
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== Running Cambridge Physics 5054 Syllabus & RAG Verification Suite ===\n');

// 1. Dataset Integrity, Schema & Objective-Level Page Tests
console.log('--- 1. Testing Dataset Integrity, Schema & Objective-Level Pages ---');
const datasetPath = path.join(__dirname, '..', 'data', 'syllabus', 'physics-5054-2026-2028.json');
assert(fs.existsSync(datasetPath), 'Dataset file must exist at data/syllabus/physics-5054-2026-2028.json');

const raw = fs.readFileSync(datasetPath, 'utf8');
const dataset = JSON.parse(raw);

assert.strictEqual(dataset.meta.syllabus_code, '5054');
assert.strictEqual(dataset.meta.qualification, 'Cambridge O Level');
assert.strictEqual(dataset.meta.examination_years, '2026-2028');
assert.strictEqual(dataset.meta.syllabus_version, 'Version 2.0');
assert(dataset.meta.source_urls.syllabus_pdf.includes('697324-2026-2028-syllabus.pdf'), 'Source PDF URL mismatch');
assert(dataset.meta.source_urls.syllabus_update_pdf.includes('748934-2026-2028-syllabus-update.pdf'), 'Update URL mismatch');

assert.strictEqual(dataset.topics.length, 6, 'Must contain all 6 core syllabus topics');
const topicTitles = dataset.topics.map(t => t.title);
assert(topicTitles.includes('Motion, forces and energy'), 'Topic 1 missing');
assert(topicTitles.includes('Thermal physics'), 'Topic 2 missing');
assert(topicTitles.includes('Waves'), 'Topic 3 missing');
assert(topicTitles.includes('Electricity and magnetism'), 'Topic 4 missing');
assert(topicTitles.includes('Nuclear physics'), 'Topic 5 missing');
assert(topicTitles.includes('Space physics'), 'Topic 6 (Space physics) missing');

// Verify every objective has valid fields, discrete ID, and verified objective-level page reference
let totalObjectives = 0;
for (const topic of dataset.topics) {
  assert(topic.topic_id, 'Topic missing ID');
  assert(topic.subtopics && topic.subtopics.length > 0, `Topic ${topic.topic_id} missing subtopics`);
  for (const subtopic of topic.subtopics) {
    assert(typeof subtopic.page_reference === 'number' && subtopic.page_reference >= 12, `Subtopic ${subtopic.subtopic_id} invalid start page`);
    for (const obj of subtopic.objectives) {
      assert(obj.id && obj.id.startsWith('5054-'), `Objective ${obj.id} invalid ID format`);
      assert(obj.wording && obj.wording.length > 10, `Objective ${obj.id} wording too short or missing`);
      assert(obj.classification, `Objective ${obj.id} missing classification`);
      assert(typeof obj.page === 'number' && obj.page >= 12 && obj.page <= 33, `Objective ${obj.id} missing valid physical page (12-33): got ${obj.page}`);
      totalObjectives++;
    }
  }
}
assert.strictEqual(totalObjectives, 99, `Must contain exactly 99 discrete learning objectives, got ${totalObjectives}`);
console.log(`✔ Dataset validated: 6 topics, ${totalObjectives} discrete objectives with verified objective-level page references (Pages 12–33).`);

// 2. Vercel File Inclusion & Serverless Bundling Tests
console.log('\n--- 2. Testing Vercel File Inclusion & Bundled Fallback ---');
const bundledPath = path.join(__dirname, '..', 'api', '_lib', 'physics-5054-2026-2028.json');
assert(fs.existsSync(bundledPath), 'Bundled dataset must exist at api/_lib/physics-5054-2026-2028.json for Vercel Serverless Function bundling');
const bundledRaw = fs.readFileSync(bundledPath, 'utf8');
const bundledDataset = JSON.parse(bundledRaw);
assert.strictEqual(bundledDataset.meta.syllabus_version, 'Version 2.0', 'Bundled dataset version mismatch');
console.log('✔ Vercel serverless bundle inclusion verified (api/_lib/physics-5054-2026-2028.json present & in sync).');

// 3. Syllabus Retriever Unit Tests & Relevance Limits
console.log('\n--- 3. Testing Syllabus Retriever Relevance & Hard Limits ---');
const { retrieveSyllabusContext } = require('../api/_lib/syllabus-retriever');

// Test 3.1: Ohm's Law and Resistance (Page 26)
const q1 = "How does current relate to potential difference according to Ohm's Law?";
const r1 = retrieveSyllabusContext('physics', q1);
assert(r1.objectives.length > 0 && r1.objectives.length <= 3, 'Must return 1 to 3 objectives');
assert(r1.objectives.some(o => o.id === '5054-4.2.4.4' || o.id === '5054-4.2.4.1'), 'Must match 4.2.4 resistance objectives');
assert(r1.objectives.some(o => (o.id === '5054-4.2.4.4' || o.id === '5054-4.2.4.1') && o.page === 26), 'Primary resistance objectives must point to Page 26');
assert(r1.formattedContext.includes('Page 26'), 'Formatted context must specify Page 26');
assert(r1.formattedContext.length <= 1000, `Context exceeds 1000 char hard limit: ${r1.formattedContext.length}`);
console.log('✔ Ohm\'s Law retrieval passed (Page 26, hard limits enforced):', r1.objectives.map(o => `${o.id} (p.${o.page})`).join(', '));

// Test 3.2: Electrical Power (Page 27)
const q2 = "What is the formula to calculate electrical power dissipation in a component?";
const r2 = retrieveSyllabusContext('physics', q2);
assert(r2.objectives.some(o => o.id === '5054-4.4.1.3'), 'Must match P = IV objective 4.4.1.3');
assert.strictEqual(r2.objectives.find(o => o.id === '5054-4.4.1.3').page, 27, '4.4.1.3 must be on Page 27');
console.log('✔ Electrical Power retrieval passed:', r2.objectives.map(o => `${o.id} (p.${o.page})`).join(', '));

// Test 3.3: Circuit Diagrams (Page 26)
const q3 = "How to draw and interpret circuit diagrams with voltmeters, ammeters, lamps and resistors?";
const r3 = retrieveSyllabusContext('physics', q3);
assert(r3.objectives.some(o => o.id === '5054-4.3.1.1'), 'Must match circuit diagrams objective 4.3.1.1');
assert.strictEqual(r3.objectives.find(o => o.id === '5054-4.3.1.1').page, 26, '4.3.1.1 must be on Page 26');
console.log('✔ Circuit diagram retrieval passed:', r3.objectives.map(o => `${o.id} (p.${o.page})`).join(', '));

// Test 3.4: Space Physics - Stellar Evolution (Page 33)
const q4 = "Describe stellar evolution from protostar to red giant, supernova, white dwarf or black hole.";
const r4 = retrieveSyllabusContext('physics', q4);
assert(r4.objectives.some(o => o.id === '5054-6.2.2.1'), 'Must match stellar evolution objective 6.2.2.1');
assert.strictEqual(r4.objectives.find(o => o.id === '5054-6.2.2.1').page, 33, '6.2.2.1 must be on Page 33');
console.log('✔ Space Physics (Topic 6) retrieval passed:', r4.objectives.map(o => `${o.id} (p.${o.page})`).join(', '));

// Test 3.5: Redshift and Expanding Universe - Zero False Positives (Page 33)
const q5 = "Why do distant galaxies exhibit redshift and what does it tell us about the Universe?";
const r5 = retrieveSyllabusContext('physics', q5);
assert(r5.objectives.length >= 1 && r5.objectives.length <= 2, `Must return 1 or 2 high-confidence Space Physics matches, got ${r5.objectives.length}`);
assert.strictEqual(r5.objectives[0].id, '5054-6.2.3.2', 'Top match must be redshift objective 6.2.3.2');
assert(r5.objectives.every(o => o.id.startsWith('5054-6.2.3') && o.page === 33), 'All returned objectives must be Space Physics 6.2.3 on Page 33');
// Verify NO circuit diagram or micrometer noise leaked into redshift query
assert(!r5.objectives.some(o => o.id.startsWith('5054-4.') || o.id.startsWith('5054-1.')), 'Must not leak circuit or measurement noise into Space Physics');
console.log('✔ Redshift & Big Bang retrieval passed with zero false positives (Page 33):', r5.objectives[0].id);

// Test 3.6: Irrelevant conversational fluff
const q6 = "Hello, how are you today?";
const r6 = retrieveSyllabusContext('physics', q6);
assert.strictEqual(r6.objectives.length, 0, 'Fluff should return 0 objectives');
assert.strictEqual(r6.formattedContext, '', 'Fluff context must be empty string');
console.log('✔ Conversational fluff safely returns 0 objectives');

// Test 3.7: Non-Physics subject separation
const q7 = "What is neutralisation and stoichiometry?";
const r7 = retrieveSyllabusContext('chemistry', q7);
assert.strictEqual(r7.objectives.length, 0, 'Chemistry must not return Physics 5054 objectives');
console.log('✔ Subject boundary respected (Chemistry returns 0 5054 objectives)');

// Test 3.8: Hard Limits (length <= 1000, count <= 3)
const longText = 'physics force motion energy '.repeat(100);
const rLong = retrieveSyllabusContext('physics', longText);
assert(rLong.objectives.length <= 3, 'Must cap results at 3');
assert(rLong.formattedContext.length <= 1000, `Context must be <= 1000 characters: got ${rLong.formattedContext.length}`);
console.log('✔ Hard character limits and max results bound verified.');

// Test 3.9: Regression Suite for 5 Targeted Quality Review Questions
console.log('\n--- 3.9 Regression Assertions for 5 Targeted Questions ---');
const targetQueries = [
  {
    q: "State the equation relating resistance, potential difference and current.",
    expectedId: "5054-4.2.4.1",
    expectedPage: 26,
    expectedCount: 1
  },
  {
    q: "State Ohm's law and its conditions.",
    expectedId: "5054-4.2.4.4",
    expectedPage: 26,
    expectedCount: 1
  },
  {
    q: "Describe the current-voltage graph for a resistor.",
    expectedId: "5054-4.2.4.5",
    expectedPage: 26,
    expectedCount: 1
  },
  {
    q: "Calculate electrical power using voltage and current.",
    expectedId: "5054-4.4.1.3",
    expectedPage: 27,
    expectedCount: 1
  },
  {
    q: "Explain redshift and how it supports an expanding Universe.",
    expectedId: "5054-6.2.3.2",
    expectedPage: 33,
    expectedCount: 1
  }
];

for (const item of targetQueries) {
  const result = retrieveSyllabusContext('physics', item.q);
  assert.strictEqual(result.objectives.length, item.expectedCount, `Query "${item.q}" expected ${item.expectedCount} objective(s), got ${result.objectives.length}`);
  assert.strictEqual(result.objectives[0].id, item.expectedId, `Query "${item.q}" expected objective ${item.expectedId}, got ${result.objectives[0].id}`);
  assert.strictEqual(result.objectives[0].page, item.expectedPage, `Query "${item.q}" expected page ${item.expectedPage}, got ${result.objectives[0].page}`);
  assert(result.formattedContext.length <= 1000, `Context length must be <= 1000 chars for "${item.q}"`);
  console.log(`✔ Verified targeted query: "${item.q.substring(0, 45)}..." -> [${item.expectedId}] (Page ${item.expectedPage})`);
}

// 4. Labs Educational Data Mapping Tests
console.log('\n--- 4. Testing Labs Data Model (labs-data.js) ---');
const LabsData = require('../js/labs/labs-data.js');
const ohmsExp = LabsData.getExperimentById('ohms-law');
assert(ohmsExp !== null, 'ohms-law experiment must exist');
assert(ohmsExp.verifiedSyllabus, 'ohms-law must have verifiedSyllabus block');
assert.strictEqual(ohmsExp.verifiedSyllabus.syllabusCode, '5054');
assert.strictEqual(ohmsExp.verifiedSyllabus.status, 'verified');
assert(ohmsExp.verifiedSyllabus.matchedObjectives.length >= 4, 'Must have at least 4 matched 5054 objectives');
assert(ohmsExp.verifiedSyllabus.matchedObjectives.every(o => o.page === 26 || o.page === 27), 'Matched lab objectives must have verified pages 26 or 27');
assert(ohmsExp.syllabusVerificationNote.includes('Verified against official Cambridge O Level Physics 5054'), 'Verification note mismatch');
assert(ohmsExp.provisionalSyllabus.includes('Cambridge IGCSE Physics (0625) [Unverified, Separate]'), 'IGCSE must remain separate and unverified');
console.log('✔ labs-data.js Ohm\'s Law mapped to verified 5054 objectives with accurate pages and IGCSE kept separate.');

// 5. API Chat Integration Syntax & Module Loading Test
console.log('\n--- 5. Testing api/chat.js Syntax & Handler ---');
const chatModule = require('../api/chat.js');
assert.strictEqual(typeof chatModule, 'function', 'api/chat.js must export an async handler function');
console.log('✔ api/chat.js imports and exports valid handler.');

console.log('\n=====================================================================');
console.log('🎉 ALL CAMBRIDGE 5054 SYLLABUS & RAG VERIFICATION TESTS PASSED!');
console.log('=====================================================================\n');
