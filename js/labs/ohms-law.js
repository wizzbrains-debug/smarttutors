/**
 * SmartTutors Interactive Labs — Ohm's Law Physics Experiment
 * 
 * Implements SimulationProvider interface for Ohm's Law ($I = V / R, P = V \times I$).
 * Provides SVG circuit visualization, digital meters, dynamic power/glow scaling,
 * guided questions, and pedagogical AI integration.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['./simulation-provider', './labs-data'], factory);
  } else if (typeof module === 'object' && module.exports) {
    const Provider = require('./simulation-provider');
    const Data = require('./labs-data');
    module.exports = factory(Provider, Data);
  } else {
    root.SmartTutorsLabs = root.SmartTutorsLabs || {};
    const Provider = root.SmartTutorsLabs.SimulationProvider;
    const Data = root.SmartTutorsLabs.LabsData;
    root.SmartTutorsLabs.OhmsLawSimulation = factory(Provider, Data);
  }
}(typeof self !== 'undefined' ? self : this, function (SimulationProvider, LabsData) {
  'use strict';

  // Fallback base class if loaded out of order
  const BaseClass = SimulationProvider || class {
    constructor() { this.listeners = new Map(); }
    on(e, h) { if (!this.listeners.has(e)) this.listeners.set(e, new Set()); this.listeners.get(e).add(h); return this; }
    off(e, h) { if (this.listeners.has(e)) this.listeners.get(e).delete(h); return this; }
    emit(e, d) { if (this.listeners.has(e)) for (const h of this.listeners.get(e)) h(d); }
    getState() { return this.state; }
  };

  class OhmsLawSimulation extends BaseClass {
    constructor(config = {}) {
      super(config);
      this.experimentId = 'ohms-law';
      this.metadata = LabsData ? LabsData.getExperimentById(this.experimentId) : null;

      // Default state
      this.defaultState = {
        voltage: 9.0,        // Volts (V)
        resistance: 100.0,   // Ohms (Ω)
        isCircuitClosed: true,
        animationActive: true
      };

      // Current state
      this.state = Object.assign({}, this.defaultState);
      this.calculated = {
        current: 0.09,       // Amperes (A)
        power: 0.81,         // Watts (W)
        currentFormatted: '90.0 mA',
        powerFormatted: '810.0 mW',
        status: 'normal'     // 'normal', 'low', 'high-power', 'warning'
      };

      this.animFrameId = null;
      this.dashOffset = 0;
      this.recalculate();
    }

    /**
     * Physics calculation engine
     * $I = V / R$
     * $P = V \times I = I^2 \times R$
     */
    recalculate() {
      const v = Math.max(1.0, Math.min(24.0, Number(this.state.voltage) || 1.0));
      const r = Math.max(10.0, Math.min(1000.0, Number(this.state.resistance) || 10.0));

      this.state.voltage = v;
      this.state.resistance = r;

      if (!this.state.isCircuitClosed) {
        this.calculated.current = 0;
        this.calculated.power = 0;
        this.calculated.currentFormatted = '0.0 mA';
        this.calculated.powerFormatted = '0.0 mW';
        this.calculated.status = 'open-circuit';
        return this.calculated;
      }

      const current = v / r; // in Amperes
      const power = v * current; // in Watts

      this.calculated.current = current;
      this.calculated.power = power;

      // Format current cleanly
      if (current < 1.0) {
        this.calculated.currentFormatted = (current * 1000).toFixed(1) + ' mA';
      } else {
        this.calculated.currentFormatted = current.toFixed(3) + ' A';
      }

      // Format power cleanly
      if (power < 1.0) {
        this.calculated.powerFormatted = (power * 1000).toFixed(1) + ' mW';
      } else {
        this.calculated.powerFormatted = power.toFixed(2) + ' W';
      }

      // Safety / status classification
      if (current >= 1.5 || power >= 20.0) {
        this.calculated.status = 'warning';
      } else if (power >= 8.0) {
        this.calculated.status = 'high-power';
      } else if (current < 0.02) {
        this.calculated.status = 'low';
      } else {
        this.calculated.status = 'normal';
      }

      return this.calculated;
    }

    /**
     * Initialize simulation inside container
     */
    init(container, initialParams = {}) {
      if (!container) throw new Error('[OhmsLawSimulation] Container required');
      this.container = container;
      this.isInitialized = true;

      if (initialParams.voltage !== undefined) this.state.voltage = initialParams.voltage;
      if (initialParams.resistance !== undefined) this.state.resistance = initialParams.resistance;

      this.recalculate();
      this.render();
      this.attachEventListeners();
      this.startAnimationLoop();
      this.emit('initialized', { state: this.state, calculated: this.calculated });
    }

    /**
     * Update parameters
     */
    update(params = {}) {
      if (params.voltage !== undefined) this.state.voltage = Number(params.voltage);
      if (params.resistance !== undefined) this.state.resistance = Number(params.resistance);
      if (params.isCircuitClosed !== undefined) this.state.isCircuitClosed = Boolean(params.isCircuitClosed);
      if (params.animationActive !== undefined) this.state.animationActive = Boolean(params.animationActive);

      this.recalculate();
      this.updateVisuals();
      this.emit('stateChange', { state: this.state, calculated: this.calculated });
      return this.getState();
    }

    /**
     * Reset to standard defaults
     */
    reset() {
      this.state = Object.assign({}, this.defaultState);
      this.recalculate();
      this.updateVisuals();
      this.syncInputs();
      this.emit('reset', { state: this.state, calculated: this.calculated });
      return this.getState();
    }

    /**
     * Apply preset configuration
     */
    applyPreset(presetId) {
      if (!this.metadata || !this.metadata.presets) return;
      const preset = this.metadata.presets.find(p => p.id === presetId);
      if (preset) {
        this.update({
          voltage: preset.voltage,
          resistance: preset.resistance
        });
        this.syncInputs();
      }
    }

    /**
     * Full state snapshot
     */
    getState() {
      return {
        state: Object.assign({}, this.state),
        calculated: Object.assign({}, this.calculated),
        metadata: this.metadata
      };
    }

    /**
     * Synchronize DOM input controls with internal state
     */
    syncInputs() {
      if (!this.container) return;
      const vSlider = this.container.querySelector('#ohms-voltage-slider');
      const vDisplay = this.container.querySelector('#ohms-voltage-display');
      const rSlider = this.container.querySelector('#ohms-resistance-slider');
      const rDisplay = this.container.querySelector('#ohms-resistance-display');

      if (vSlider) vSlider.value = this.state.voltage;
      if (vDisplay) vDisplay.textContent = this.state.voltage.toFixed(1) + ' V';
      if (rSlider) rSlider.value = this.state.resistance;
      if (rDisplay) rDisplay.textContent = Math.round(this.state.resistance) + ' Ω';
    }

    /**
     * Render complete HTML structure and SVG circuit diagram
     */
    render() {
      this.container.innerHTML = `
        <div class="ohms-lab-wrapper">
          <!-- Laboratory Header Bar -->
          <div class="ohms-lab-header">
            <div class="ohms-lab-title-area">
              <span class="ohms-badge-physics">Physics Lab #01</span>
              <h3 class="ohms-lab-title">Ohm's Law: Direct Current Circuit</h3>
              <p class="ohms-lab-subtitle">Syllabus Topic: Electricity &amp; Magnetism &bull; Verified Formula: <code>I = V / R</code></p>
            </div>
            <div class="ohms-lab-actions">
              <button type="button" class="ohms-btn ohms-btn-ghost" id="ohms-reset-btn" title="Reset to standard laboratory values (9V, 100Ω)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                Reset Circuit
              </button>
            </div>
          </div>

          <!-- Main Laboratory Workbench Grid -->
          <div class="ohms-workbench-grid">
            <!-- Left Panel: Interactive Circuit Visualizer -->
            <div class="ohms-circuit-card">
              <div class="ohms-circuit-card-header">
                <span class="ohms-card-heading">Schematic Apparatus</span>
                <div class="ohms-circuit-status-pill" id="ohms-circuit-status">
                  <span class="ohms-status-dot"></span>
                  <span id="ohms-status-text">Live Circuit</span>
                </div>
              </div>

              <!-- SVG Circuit Diagram -->
              <div class="ohms-svg-container" id="ohms-svg-wrap">
                <svg id="ohms-circuit-svg" viewBox="0 0 600 360" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Ohm's Law Circuit Diagram with Battery, Voltmeter, Ammeter, and Resistor Load">
                  <defs>
                    <!-- Bulb Glow Filter -->
                    <filter id="bulb-glow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>
                      <feMerge>
                        <feMergeNode in="blur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                    <!-- Subtle Drop Shadow -->
                    <filter id="meter-shadow" x="-10%" y="-10%" width="120%" height="120%">
                      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.15"/>
                    </filter>
                  </defs>

                  <!-- Outer Circuit Wire Loop -->
                  <!-- Path: (80,180) -> (80,60) -> (520,60) -> (520,300) -> (80,300) -> (80,180) -->
                  <path id="ohms-wire-base" class="ohms-wire-path" d="M 80,140 L 80,60 L 520,60 L 520,300 L 80,300 L 80,220" />
                  <path id="ohms-wire-electrons" class="ohms-wire-electrons" d="M 80,140 L 80,60 L 520,60 L 520,300 L 80,300 L 80,220" />

                  <!-- Parallel Voltmeter Wires across Resistor & Bulb -->
                  <path class="ohms-wire-parallel" d="M 320,60 L 320,130 L 440,130 L 440,60" />

                  <!-- 1. DC Battery / Power Supply (Left: centered at x=80, y=180) -->
                  <g class="ohms-component ohms-comp-battery" transform="translate(80, 180)">
                    <!-- Battery Plates: Long Positive, Short Negative -->
                    <line x1="-24" y1="-20" x2="24" y2="-20" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                    <line x1="-12" y1="-8"  x2="12" y2="-8"  stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                    <line x1="-24" y1="4"   x2="24" y2="4"   stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                    <line x1="-12" y1="16"  x2="12" y2="16"  stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                    <!-- Polarity Signs -->
                    <text x="-32" y="-14" class="ohms-symbol-text" fill="var(--coral, #FF6B6B)">+</text>
                    <text x="-32" y="22" class="ohms-symbol-text" fill="var(--violet, #7C3AED)">&minus;</text>
                    <!-- Voltage Tag -->
                    <rect x="18" y="-12" width="60" height="24" rx="6" class="ohms-tag-bg" />
                    <text x="48" y="4" class="ohms-tag-text" id="svg-battery-val">9.0 V</text>
                    <text x="48" y="24" class="ohms-component-label">DC Source</text>
                  </g>

                  <!-- 2. Ammeter (Top series: centered at x=200, y=60) -->
                  <g class="ohms-component ohms-comp-meter" transform="translate(200, 60)" filter="url(#meter-shadow)">
                    <circle cx="0" cy="0" r="28" class="ohms-meter-circle" />
                    <circle cx="0" cy="0" r="24" class="ohms-meter-inner" />
                    <text x="0" y="-4" class="ohms-meter-badge">A</text>
                    <text x="0" y="14" class="ohms-meter-subval" id="svg-ammeter-val">90 mA</text>
                    <text x="0" y="44" class="ohms-component-label">Ammeter (Series)</text>
                  </g>

                  <!-- 3. Resistor Load (Top series: centered at x=360, y=60) -->
                  <g class="ohms-component ohms-comp-resistor" transform="translate(360, 60)">
                    <!-- Standard Zig-Zag Resistor Symbol -->
                    <rect x="-35" y="-14" width="70" height="28" rx="6" class="ohms-resistor-body" />
                    <path class="ohms-zigzag-path" d="M -30,0 L -22,-8 L -14,8 L -6,-8 L 2,8 L 10,-8 L 18,8 L 26,-8 L 30,0" />
                    <text x="0" y="3" class="ohms-resistor-val" id="svg-resistor-val">100 Ω</text>
                    <text x="0" y="34" class="ohms-component-label">Resistor (R)</text>
                  </g>

                  <!-- 4. Voltmeter in Parallel (Below Resistor: centered at x=380, y=130) -->
                  <g class="ohms-component ohms-comp-meter" transform="translate(380, 130)" filter="url(#meter-shadow)">
                    <circle cx="0" cy="0" r="24" class="ohms-meter-circle" />
                    <circle cx="0" cy="0" r="20" class="ohms-meter-inner" />
                    <text x="0" y="-2" class="ohms-meter-badge ohms-volt-color">V</text>
                    <text x="0" y="12" class="ohms-meter-subval" id="svg-voltmeter-val">9.0 V</text>
                    <text x="0" y="36" class="ohms-component-label">Voltmeter (Parallel)</text>
                  </g>

                  <!-- 5. Light Bulb Load / Power Dissipator (Right leg: centered at x=520, y=180) -->
                  <g class="ohms-component ohms-comp-bulb" transform="translate(520, 180)">
                    <!-- Radiant Glow Behind Bulb -->
                    <circle id="svg-bulb-halo" cx="0" cy="0" r="32" class="ohms-bulb-halo" filter="url(#bulb-glow)" />
                    <!-- Glass Enclosure -->
                    <circle cx="0" cy="0" r="24" class="ohms-bulb-glass" />
                    <!-- Filament Coil -->
                    <path id="svg-bulb-filament" class="ohms-bulb-filament" d="M -10,12 L -6,0 L -2,6 L 2,6 L 6,0 L 10,12" />
                    <!-- Bulb Base Socket -->
                    <rect x="-8" y="20" width="16" height="8" rx="2" class="ohms-bulb-base" />
                    <!-- Power Readout -->
                    <text x="0" y="-34" class="ohms-component-label">Load Dissipation</text>
                    <text x="0" y="44" class="ohms-bulb-power-text" id="svg-bulb-val">0.81 W</text>
                  </g>

                  <!-- Directional Current Arrows -->
                  <g class="ohms-current-arrows" opacity="0.8">
                    <!-- Top Wire Arrow: Left to Right -->
                    <polygon points="120,56 130,60 120,64" fill="var(--violet, #7C3AED)" />
                    <!-- Right Wire Arrow: Top to Bottom -->
                    <polygon points="516,240 520,250 524,240" fill="var(--violet, #7C3AED)" />
                    <!-- Bottom Wire Arrow: Right to Left -->
                    <polygon points="300,296 290,300 300,304" fill="var(--violet, #7C3AED)" />
                  </g>
                </svg>
              </div>

              <!-- Real-Time Measurement Readouts Strip -->
              <div class="ohms-readouts-bar">
                <div class="ohms-readout-item">
                  <span class="ohms-readout-label">Voltage (V)</span>
                  <span class="ohms-readout-value" id="disp-voltage">9.0 V</span>
                </div>
                <div class="ohms-readout-divider"></div>
                <div class="ohms-readout-item">
                  <span class="ohms-readout-label">Resistance (R)</span>
                  <span class="ohms-readout-value" id="disp-resistance">100 Ω</span>
                </div>
                <div class="ohms-readout-divider"></div>
                <div class="ohms-readout-item ohms-highlight-readout">
                  <span class="ohms-readout-label">Current (I = V/R)</span>
                  <span class="ohms-readout-value ohms-val-current" id="disp-current">90.0 mA</span>
                </div>
                <div class="ohms-readout-divider"></div>
                <div class="ohms-readout-item">
                  <span class="ohms-readout-label">Power (P = V&times;I)</span>
                  <span class="ohms-readout-value ohms-val-power" id="disp-power">810.0 mW</span>
                </div>
              </div>
            </div>

            <!-- Right Panel: Controls, Presets & Pedagogy -->
            <div class="ohms-controls-card">
              <div class="ohms-controls-header">
                <span class="ohms-card-heading">Circuit Controls</span>
                <span class="ohms-control-hint">Adjust parameters to observe response</span>
              </div>

              <!-- Controls Form -->
              <div class="ohms-sliders-group">
                <!-- Voltage Slider -->
                <div class="ohms-slider-row">
                  <div class="ohms-slider-label-row">
                    <label for="ohms-voltage-slider" class="ohms-slider-title">
                      <span class="ohms-param-dot ohms-dot-volt"></span>
                      Voltage Source (V)
                    </label>
                    <span class="ohms-slider-num" id="ohms-voltage-display">9.0 V</span>
                  </div>
                  <input type="range" id="ohms-voltage-slider" class="ohms-slider" min="1.0" max="24.0" step="0.5" value="9.0" aria-label="DC Voltage in Volts">
                  <div class="ohms-slider-ticks">
                    <span>1V</span>
                    <span>6V</span>
                    <span>12V</span>
                    <span>18V</span>
                    <span>24V</span>
                  </div>
                </div>

                <!-- Resistance Slider -->
                <div class="ohms-slider-row">
                  <div class="ohms-slider-label-row">
                    <label for="ohms-resistance-slider" class="ohms-slider-title">
                      <span class="ohms-param-dot ohms-dot-res"></span>
                      Circuit Resistance (R)
                    </label>
                    <span class="ohms-slider-num" id="ohms-resistance-display">100 Ω</span>
                  </div>
                  <input type="range" id="ohms-resistance-slider" class="ohms-slider" min="10" max="1000" step="10" value="100" aria-label="Circuit Resistance in Ohms">
                  <div class="ohms-slider-ticks">
                    <span>10Ω</span>
                    <span>250Ω</span>
                    <span>500Ω</span>
                    <span>750Ω</span>
                    <span>1000Ω</span>
                  </div>
                </div>
              </div>

              <!-- Benchmark Presets -->
              <div class="ohms-presets-section">
                <span class="ohms-subheading">Standard Benchmarks</span>
                <div class="ohms-presets-grid">
                  <button type="button" class="ohms-preset-btn active" data-preset="standard-9v">
                    <span class="ohms-preset-title">Standard 9V</span>
                    <span class="ohms-preset-sub">9V &bull; 100Ω</span>
                  </button>
                  <button type="button" class="ohms-preset-btn" data-preset="low-voltage">
                    <span class="ohms-preset-title">Low Voltage</span>
                    <span class="ohms-preset-sub">3V &bull; 150Ω</span>
                  </button>
                  <button type="button" class="ohms-preset-btn" data-preset="high-resistance">
                    <span class="ohms-preset-title">High Resistance</span>
                    <span class="ohms-preset-sub">12V &bull; 600Ω</span>
                  </button>
                  <button type="button" class="ohms-preset-btn" data-preset="max-power">
                    <span class="ohms-preset-title">High Power</span>
                    <span class="ohms-preset-sub">18V &bull; 40Ω</span>
                  </button>
                </div>
              </div>

              <!-- Guided Observations & AI Tutor Bridge -->
              <div class="ohms-pedagogy-section">
                <div class="ohms-pedagogy-header">
                  <span class="ohms-subheading">Guided Inquiry</span>
                  <span class="ohms-badge-caie">Cambridge 0625 / 5054</span>
                </div>
                <div class="ohms-inquiry-box">
                  <p class="ohms-inquiry-prompt" id="ohms-active-prompt">
                    &ldquo;If you double the potential difference from 9V to 18V while keeping resistance fixed at 100&Omega;, what happens to the electric current and bulb brightness?&rdquo;
                  </p>
                  <div class="ohms-inquiry-options">
                    <button type="button" class="ohms-btn ohms-btn-ai" id="ohms-ask-ai-btn">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6M9 10h6"/></svg>
                      Ask AI Tutor About Current State
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      `;
    }

    /**
     * Update dynamic visual elements
     */
    updateVisuals() {
      if (!this.container) return;

      const v = this.state.voltage;
      const r = this.state.resistance;
      const calc = this.calculated;

      // Update text displays
      const dispV = this.container.querySelector('#disp-voltage');
      const dispR = this.container.querySelector('#disp-resistance');
      const dispI = this.container.querySelector('#disp-current');
      const dispP = this.container.querySelector('#disp-power');

      if (dispV) dispV.textContent = v.toFixed(1) + ' V';
      if (dispR) dispR.textContent = Math.round(r) + ' Ω';
      if (dispI) dispI.textContent = calc.currentFormatted;
      if (dispP) dispP.textContent = calc.powerFormatted;

      // Update SVG tags
      const svgBat = this.container.querySelector('#svg-battery-val');
      const svgRes = this.container.querySelector('#svg-resistor-val');
      const svgAmm = this.container.querySelector('#svg-ammeter-val');
      const svgVlt = this.container.querySelector('#svg-voltmeter-val');
      const svgBlb = this.container.querySelector('#svg-bulb-val');

      if (svgBat) svgBat.textContent = v.toFixed(1) + ' V';
      if (svgRes) svgRes.textContent = Math.round(r) + ' Ω';
      if (svgAmm) svgAmm.textContent = calc.currentFormatted;
      if (svgVlt) svgVlt.textContent = v.toFixed(1) + ' V';
      if (svgBlb) svgBlb.textContent = calc.powerFormatted;

      // Scale bulb glow & brightness with power
      const bulbHalo = this.container.querySelector('#svg-bulb-halo');
      const bulbFilament = this.container.querySelector('#svg-bulb-filament');

      if (bulbHalo && bulbFilament) {
        // Power range: approx 0.001W to 57.6W
        // Normalized power factor for glow: 0 to 1
        const normP = Math.min(1.0, Math.max(0.05, Math.sqrt(calc.power) / 3.0));
        const glowRadius = Math.round(18 + normP * 40);
        const glowOpacity = (0.2 + normP * 0.75).toFixed(2);

        bulbHalo.setAttribute('r', glowRadius);
        bulbHalo.style.opacity = glowOpacity;
        bulbHalo.style.fill = `rgba(255, ${Math.round(200 + normP * 55)}, ${Math.round(80 - normP * 60)}, ${glowOpacity})`;

        // Filament glow color
        const filColor = normP > 0.6 ? '#FFF4CC' : normP > 0.25 ? '#FFD166' : '#FF9F1C';
        bulbFilament.style.stroke = filColor;
        bulbFilament.style.strokeWidth = (2 + normP * 2).toFixed(1);
      }

      // Update status pill
      const statusPill = this.container.querySelector('#ohms-circuit-status');
      const statusText = this.container.querySelector('#ohms-status-text');
      if (statusPill && statusText) {
        statusPill.className = 'ohms-circuit-status-pill status-' + calc.status;
        if (calc.status === 'warning') {
          statusText.textContent = 'High Dissipation Alert';
        } else if (calc.status === 'high-power') {
          statusText.textContent = 'High Load';
        } else if (calc.status === 'low') {
          statusText.textContent = 'Low Current';
        } else {
          statusText.textContent = 'Live Circuit';
        }
      }
    }

    /**
     * Continuous animation loop for electron flow along the circuit wire
     */
    startAnimationLoop() {
      const electronPath = this.container ? this.container.querySelector('#ohms-wire-electrons') : null;
      if (!electronPath) return;

      const animate = () => {
        if (this.isInitialized && this.state.animationActive && this.state.isCircuitClosed) {
          // Speed strictly proportional to current I
          // Range of current: 0.001A to 2.4A
          const speed = Math.max(0.3, Math.min(8.0, this.calculated.current * 40));
          this.dashOffset = (this.dashOffset - speed) % 1000;
          electronPath.style.strokeDashoffset = this.dashOffset;
        }
        this.animFrameId = requestAnimationFrame(animate);
      };
      this.animFrameId = requestAnimationFrame(animate);
    }

    /**
     * Attach UI listeners
     */
    attachEventListeners() {
      if (!this.container) return;

      const vSlider = this.container.querySelector('#ohms-voltage-slider');
      const rSlider = this.container.querySelector('#ohms-resistance-slider');
      const resetBtn = this.container.querySelector('#ohms-reset-btn');
      const aiBtn = this.container.querySelector('#ohms-ask-ai-btn');
      const presetBtns = this.container.querySelectorAll('.ohms-preset-btn');

      if (vSlider) {
        vSlider.addEventListener('input', (e) => {
          this.update({ voltage: parseFloat(e.target.value) });
          const disp = this.container.querySelector('#ohms-voltage-display');
          if (disp) disp.textContent = this.state.voltage.toFixed(1) + ' V';
          this.clearActivePresetHighlight();
        });
      }

      if (rSlider) {
        rSlider.addEventListener('input', (e) => {
          this.update({ resistance: parseFloat(e.target.value) });
          const disp = this.container.querySelector('#ohms-resistance-display');
          if (disp) disp.textContent = Math.round(this.state.resistance) + ' Ω';
          this.clearActivePresetHighlight();
        });
      }

      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          this.reset();
          this.highlightPreset('standard-9v');
        });
      }

      if (presetBtns) {
        presetBtns.forEach(btn => {
          btn.addEventListener('click', (e) => {
            const presetId = btn.getAttribute('data-preset');
            this.applyPreset(presetId);
            this.highlightPreset(presetId);
          });
        });
      }

      if (aiBtn) {
        aiBtn.addEventListener('click', () => {
          this.triggerAITutorInquiry();
        });
      }
    }

    clearActivePresetHighlight() {
      if (!this.container) return;
      this.container.querySelectorAll('.ohms-preset-btn').forEach(b => b.classList.remove('active'));
    }

    highlightPreset(presetId) {
      if (!this.container) return;
      this.clearActivePresetHighlight();
      const target = this.container.querySelector(`.ohms-preset-btn[data-preset="${presetId}"]`);
      if (target) target.classList.add('active');
    }

    /**
     * Dispatch structured inquiry to the Gemini AI Tutor widget
     */
    triggerAITutorInquiry() {
      const v = this.state.voltage.toFixed(1);
      const r = Math.round(this.state.resistance);
      const i = this.calculated.currentFormatted;
      const p = this.calculated.powerFormatted;

      const questionPrompt = `I am testing Ohm's Law in the SmartTutors Interactive Lab. My circuit is currently set to: Potential Difference (V) = ${v} V, Resistance (R) = ${r} Ω. The measured current is I = ${i} and power dissipation is P = ${p}. Can you guide me through how changing either the voltage or resistance will affect the current according to Cambridge Physics principles?`;

      if (window.SmartTutorsAI && typeof window.SmartTutorsAI.askAboutExperiment === 'function') {
        window.SmartTutorsAI.askAboutExperiment({
          experimentTitle: "Ohm's Law",
          subject: 'physics',
          prompt: questionPrompt,
          parameters: { Voltage: `${v} V`, Resistance: `${r} Ω` },
          readings: { Current: i, Power: p }
        });
      } else {
        // Fallback: click AI floating button and set prompt
        const fab = document.getElementById('ai-fab');
        const input = document.getElementById('ai-chat-input');
        if (fab) fab.click();
        if (input) {
          input.value = questionPrompt;
          input.focus();
        }
      }
    }

    /**
     * Cleanup and destruction
     */
    destroy() {
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
      super.destroy();
    }
  }

  return OhmsLawSimulation;
}));
