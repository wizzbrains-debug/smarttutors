/**
 * SmartTutors Interactive Labs — Simulation Provider Interface
 * 
 * Architectural Role:
 * Abstract base contract and event emitter for interactive science simulations.
 * Provides a clean, decoupled boundary between the SmartTutors UI and any simulation engine.
 * 
 * Visual Science Studio (VSS) Future Integration Note:
 * When Visual Science Studio (VSS) is integrated in a future phase, a VSS adapter
 * (e.g. `VssSimulationAdapter`) will extend or implement this SimulationProvider interface.
 * The SmartTutors workbench communicates exclusively through these standardized methods:
 *   - init(container, params)
 *   - update(params)
 *   - reset()
 *   - getState()
 *   - destroy()
 *   - on(event, handler) / off(event, handler) / emit(event, data)
 * 
 * No VSS runtime, repository files, or speculative dependencies are imported here.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SmartTutorsLabs = root.SmartTutorsLabs || {};
    root.SmartTutorsLabs.SimulationProvider = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Base SimulationProvider
   * Subclasses or adapters implement the specific scientific calculations and rendering.
   */
  class SimulationProvider {
    /**
     * @param {Object} [config={}] - Optional configuration options
     */
    constructor(config = {}) {
      this.config = Object.assign({}, config);
      this.container = null;
      this.state = {};
      this.listeners = new Map();
      this.isInitialized = false;
    }

    /**
     * Subscribe to simulation events (e.g. 'stateChange', 'warning', 'render')
     * @param {string} event
     * @param {Function} handler
     * @returns {SimulationProvider} this
     */
    on(event, handler) {
      if (typeof handler !== 'function') {
        throw new TypeError('Simulation event handler must be a function');
      }
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }
      this.listeners.get(event).add(handler);
      return this;
    }

    /**
     * Unsubscribe from simulation events
     * @param {string} event
     * @param {Function} handler
     * @returns {SimulationProvider} this
     */
    off(event, handler) {
      if (this.listeners.has(event)) {
        this.listeners.get(event).delete(handler);
      }
      return this;
    }

    /**
     * Emit an event to all registered listeners
     * @param {string} event
     * @param {*} data
     */
    emit(event, data) {
      if (this.listeners.has(event)) {
        for (const handler of this.listeners.get(event)) {
          try {
            handler(data);
          } catch (err) {
            console.error(`[SimulationProvider] Error in handler for event "${event}":`, err);
          }
        }
      }
    }

    /**
     * Initialize the simulation within a target DOM container.
     * Must be implemented by concrete providers.
     * @param {HTMLElement} container
     * @param {Object} [initialParams={}]
     * @returns {Promise<void>|void}
     */
    init(container, initialParams = {}) {
      if (!container || !(container instanceof HTMLElement)) {
        throw new Error('[SimulationProvider] A valid DOM HTMLElement container is required for init()');
      }
      this.container = container;
      this.isInitialized = true;
      this.emit('initialized', { container, params: initialParams });
    }

    /**
     * Update simulation parameters (e.g. voltage, resistance).
     * Must be implemented by concrete providers.
     * @param {Object} params
     * @returns {Object} Updated simulation state
     */
    update(params) {
      throw new Error('[SimulationProvider] Method update(params) must be implemented by subclass or adapter');
    }

    /**
     * Reset the simulation to default parameters.
     * Must be implemented by concrete providers.
     * @returns {Object} Reset state
     */
    reset() {
      throw new Error('[SimulationProvider] Method reset() must be implemented by subclass or adapter');
    }

    /**
     * Returns a snapshot of the current simulation state.
     * @returns {Object}
     */
    getState() {
      return Object.assign({}, this.state);
    }

    /**
     * Tear down the simulation, remove canvas/SVG, and cancel animation loops.
     */
    destroy() {
      this.listeners.clear();
      if (this.container) {
        this.container.innerHTML = '';
      }
      this.container = null;
      this.isInitialized = false;
      this.emit('destroyed', {});
    }
  }

  return SimulationProvider;
}));
