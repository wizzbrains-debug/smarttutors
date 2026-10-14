/**
 * Automated Verification Suite for SmartTutors Interactive Labs Phase 1
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== Running SmartTutors Interactive Labs Verification Suite ===\n');

// 1. SimulationProvider Tests
console.log('--- 1. Testing SimulationProvider ---');
const SimulationProvider = require('../js/labs/simulation-provider.js');
const provider = new SimulationProvider();
assert(typeof provider.init === 'function', 'init must be a function');
assert(typeof provider.update === 'function', 'update must be a function');
assert(typeof provider.reset === 'function', 'reset must be a function');
assert(typeof provider.getState === 'function', 'getState must be a function');
assert(typeof provider.destroy === 'function', 'destroy must be a function');

// Test Event Emitter
let receivedEvent = null;
const testHandler = (data) => { receivedEvent = data; };
provider.on('test-event', testHandler);
provider.emit('test-event', { val: 42 });
assert.deepStrictEqual(receivedEvent, { val: 42 }, 'Event emission failed');

provider.off('test-event', testHandler);
provider.emit('test-event', { val: 99 });
assert.deepStrictEqual(receivedEvent, { val: 42 }, 'Event unsubscription failed');
console.log('✔ SimulationProvider contract & event emitter passed');

// 2. LabsData Tests
console.log('\n--- 2. Testing LabsData ---');
const LabsData = require('../js/labs/labs-data.js');
const allExps = LabsData.getAllExperiments();
assert(allExps.length === 3, 'Expected 3 experiments in catalog');

const ohmsData = LabsData.getExperimentById('ohms-law');
assert(ohmsData !== null, 'ohms-law must exist');
assert.strictEqual(ohmsData.subject, 'physics');
assert.strictEqual(ohmsData.status, 'active');
assert(ohmsData.provisionalSyllabus.includes('0625'), 'Provisional syllabus missing');
assert(ohmsData.syllabusVerificationNote.includes('Verified') || ohmsData.syllabusVerificationNote.includes('Provisional'), 'Syllabus verification note missing');
assert(Array.isArray(ohmsData.learningObjectives) && ohmsData.learningObjectives.length > 0, 'Learning objectives missing');
assert(Array.isArray(ohmsData.presets) && ohmsData.presets.length === 4, 'Expected 4 presets');
assert(Array.isArray(ohmsData.suggestedQuestions) && ohmsData.suggestedQuestions.length > 0, 'Inquiry questions missing');

const plannedChem = LabsData.getExperimentById('acid-base-titration');
assert(plannedChem.status === 'planned', 'Chemistry should be planned');
assert(plannedChem.syllabusVerificationNote.includes('Provisional'), 'Chemistry provisional note missing');

const activeExps = LabsData.getActiveExperiments();
assert.strictEqual(activeExps.length, 1, 'Only 1 active experiment expected in Phase 1');
console.log('✔ LabsData catalog & provisional syllabus notices verified');

// 3. OhmsLawSimulation Physics Engine Tests
console.log('\n--- 3. Testing OhmsLawSimulation Physics Engine ---');
const OhmsLawSimulation = require('../js/labs/ohms-law.js');
const sim = new OhmsLawSimulation();

// Test Baseline Default (9V, 100 ohms)
let state = sim.getState();
assert.strictEqual(state.state.voltage, 9.0);
assert.strictEqual(state.state.resistance, 100.0);
assert(Math.abs(state.calculated.current - 0.09) < 1e-9, 'I = 9 / 100 = 0.09 A');
assert(Math.abs(state.calculated.power - 0.81) < 1e-9, 'P = 9 * 0.09 = 0.81 W');
assert.strictEqual(state.calculated.currentFormatted, '90.0 mA');
assert.strictEqual(state.calculated.powerFormatted, '810.0 mW');

// Test Boundary 1: Minimum Voltage & Maximum Resistance (1V, 1000 ohms)
sim.update({ voltage: 1.0, resistance: 1000.0 });
state = sim.getState();
assert(Math.abs(state.calculated.current - 0.001) < 1e-9, 'I = 1 / 1000 = 0.001 A');
assert(Math.abs(state.calculated.power - 0.001) < 1e-9, 'P = 1 * 0.001 = 0.001 W');
assert.strictEqual(state.calculated.currentFormatted, '1.0 mA');
assert.strictEqual(state.calculated.powerFormatted, '1.0 mW');

// Test Boundary 2: Maximum Voltage & Minimum Resistance (24V, 10 ohms)
sim.update({ voltage: 24.0, resistance: 10.0 });
state = sim.getState();
assert(Math.abs(state.calculated.current - 2.4) < 1e-9, 'I = 24 / 10 = 2.4 A');
assert(Math.abs(state.calculated.power - 57.6) < 1e-9, 'P = 24 * 2.4 = 57.6 W');
assert.strictEqual(state.calculated.currentFormatted, '2.400 A');
assert.strictEqual(state.calculated.powerFormatted, '57.60 W');
assert.strictEqual(state.calculated.status, 'warning');

// Test Physical Identity: P = I² * R
const pCalculated = state.calculated.power;
const pFromI2R = Math.pow(state.calculated.current, 2) * state.state.resistance;
assert(Math.abs(pCalculated - pFromI2R) < 1e-6, 'P must equal I² * R');

// Test Clamping for Out-of-Bounds Values
sim.update({ voltage: -10, resistance: 0 });
state = sim.getState();
assert.strictEqual(state.state.voltage, 1.0, 'Voltage clamped to min 1.0V');
assert.strictEqual(state.state.resistance, 10.0, 'Resistance clamped to min 10.0Ω');

sim.update({ voltage: 999, resistance: 9999 });
state = sim.getState();
assert.strictEqual(state.state.voltage, 24.0, 'Voltage clamped to max 24.0V');
assert.strictEqual(state.state.resistance, 1000.0, 'Resistance clamped to max 1000.0Ω');

// Test Presets
sim.applyPreset('low-voltage');
state = sim.getState();
assert.strictEqual(state.state.voltage, 3.0);
assert.strictEqual(state.state.resistance, 150.0);
assert(Math.abs(state.calculated.current - 0.02) < 1e-9);

// Test Reset
sim.reset();
state = sim.getState();
assert.strictEqual(state.state.voltage, 9.0);
assert.strictEqual(state.state.resistance, 100.0);
console.log('✔ OhmsLawSimulation mathematical formulas, boundaries & presets verified');

// 4. HTML Integration Tests
console.log('\n--- 4. Testing index.html Homepage Integration ---');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert(indexHtml.includes('css/labs.css'), 'labs.css link missing from index.html');
assert(indexHtml.includes('data-section="labs"'), 'Labs desktop nav link missing');
assert(indexHtml.includes('href="#labs" class="mobile-nav-link"'), 'Labs mobile nav link missing');
assert(indexHtml.includes('id="labs" class="section-block labs-section"'), 'Labs section block missing');
assert(indexHtml.includes('id="active-lab-container"'), 'active-lab-container missing');
assert(indexHtml.includes('data-subject="physics"'), 'Physics tab missing');
assert(indexHtml.includes('data-subject="chemistry"'), 'Chemistry tab missing');
assert(indexHtml.includes('data-subject="biology"'), 'Biology tab missing');
assert(indexHtml.includes('data-subject="math"'), 'Math tab missing');
assert(indexHtml.includes('js/labs/simulation-provider.js'), 'simulation-provider script tag missing');
assert(indexHtml.includes('js/labs/labs-data.js'), 'labs-data script tag missing');
assert(indexHtml.includes('js/labs/ohms-law.js'), 'ohms-law script tag missing');
assert(indexHtml.includes('js/ai-widget.js'), 'ai-widget script tag missing');
console.log('✔ index.html layout, navigation, tabs, and script loading verified');

// 5. CSS Scoping & Theme Tests
console.log('\n--- 5. Testing css/labs.css Stylesheet ---');
const labsCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'labs.css'), 'utf8');
assert(labsCss.includes('.labs-section'), '.labs-section selector missing');
assert(labsCss.includes('.ohms-lab-wrapper'), '.ohms-lab-wrapper selector missing');
assert(labsCss.includes('html.dark'), 'Dark mode styling rules missing');
assert(labsCss.includes('--violet'), 'CSS custom property integration missing');
assert(labsCss.includes('.ohms-slider'), 'Accessible slider styling missing');
assert(labsCss.includes('@media (max-width:'), 'Responsive media query missing');
console.log('✔ css/labs.css styling, scoping, and dark theme support verified');

// 6. AI Widget Bridge Tests
console.log('\n--- 6. Testing js/ai-widget.js Bridge ---');
const aiWidgetCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-widget.js'), 'utf8');
assert(aiWidgetCode.includes('window.SmartTutorsAI ='), 'window.SmartTutorsAI bridge definition missing');
assert(aiWidgetCode.includes('askAboutExperiment:'), 'askAboutExperiment bridge method missing');
assert(aiWidgetCode.includes('toggleDrawer(forceState)'), 'toggleDrawer forceState parameter missing');
console.log('✔ js/ai-widget.js bridge definition verified');

console.log('\n======================================================');
console.log('🎉 ALL SMARTTUTORS INTERACTIVE LABS TESTS PASSED!');
console.log('======================================================\n');
