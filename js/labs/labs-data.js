/**
 * SmartTutors Interactive Labs — Educational Data Model
 * 
 * IMPORTANT SYLLABUS NOTE:
 * All Cambridge curriculum and syllabus code mappings in this file are provisional
 * pending formal verification against the applicable Cambridge Assessment International
 * Education (CAIE) syllabus specifications.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SmartTutorsLabs = root.SmartTutorsLabs || {};
    root.SmartTutorsLabs.LabsData = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EXPERIMENT_CATALOG = [
    {
      id: 'ohms-law',
      title: "Ohm's Law & DC Circuit Analysis",
      subject: 'physics',
      subjectLabel: 'Physics',
      status: 'active',
      level: 'Cambridge O Level (Verified 5054) / IGCSE (Separate, Unverified)',
      verifiedSyllabus: {
        examBoard: 'Cambridge Assessment International Education',
        qualification: 'Cambridge O Level',
        syllabusCode: '5054',
        examinationYears: '2026-2028',
        version: 'Version 2.0 (Dec 2025)',
        sourcePdfUrl: 'https://www.cambridgeinternational.org/Images/697324-2026-2028-syllabus.pdf',
        status: 'verified',
        matchedObjectives: [
          {
            id: '5054-4.2.4.1',
            section: '4.2.4 Resistance',
            objectiveNumber: 1,
            page: 26,
            wording: 'Recall and use the equation resistance = p.d. / current, R = V / I'
          },
          {
            id: '5054-4.2.4.2',
            section: '4.2.4 Resistance',
            objectiveNumber: 2,
            page: 26,
            wording: 'Describe an experiment to determine resistance using a voltmeter and an ammeter and do the appropriate calculations'
          },
          {
            id: '5054-4.2.4.4',
            section: '4.2.4 Resistance',
            objectiveNumber: 4,
            page: 26,
            wording: 'State Ohm’s law, including reference to constant temperature'
          },
          {
            id: '5054-4.3.1.1',
            section: '4.3.1 Circuit diagrams and circuit components',
            objectiveNumber: 1,
            page: 26,
            wording: 'Draw and interpret circuit diagrams with cells, batteries, power supplies, switches, resistors (fixed and variable), lamps, ammeters, voltmeters, and know how these components behave in the circuit'
          },
          {
            id: '5054-4.4.1.3',
            section: '4.4.1 Uses of electricity',
            objectiveNumber: 3,
            page: 27,
            wording: 'Recall and use the equation power = current × voltage, P = I V'
          }
        ]
      },
      provisionalSyllabus: 'Cambridge O Level Physics (5054) Sections 4.2.4, 4.3.1, 4.4.1 [Verified] | Cambridge IGCSE Physics (0625) [Unverified, Separate]',
      syllabusVerificationNote: 'Verified against official Cambridge O Level Physics 5054 (2026–2028 Version 2, Dec 2025). IGCSE 0625 is kept strictly separate and remains unverified.',
      icon: 'zap',
      summary: 'Explore how electric current varies with potential difference and resistance in a direct-current circuit.',
      description: 'Ohm’s Law is the foundational relationship in electrical circuits. By adjusting the voltage source and circuit resistance, observe real-time changes in electric current, power dissipation, electron flow speed, and bulb illumination.',
      learningObjectives: [
        'Understand that current (I) is directly proportional to potential difference (V) across an ohmic conductor at constant temperature.',
        'Understand that current is inversely proportional to circuit resistance (R).',
        'Verify the mathematical relationship I = V / R and calculate electrical power dissipation using P = V × I.',
        'Observe how varying resistance affects current and energy dissipation in load components.'
      ],
      formulas: [
        { label: "Ohm's Law", formula: 'I = V / R', explanation: 'Current (Amperes) = Voltage (Volts) / Resistance (Ohms)' },
        { label: 'Electrical Power', formula: 'P = V × I = I²R', explanation: 'Power (Watts) = Potential Difference × Current' }
      ],
      parameters: {
        voltage: {
          id: 'voltage',
          label: 'Voltage (V)',
          min: 1.0,
          max: 24.0,
          default: 9.0,
          step: 0.5,
          unit: 'V',
          description: 'Potential difference supplied by the DC power source'
        },
        resistance: {
          id: 'resistance',
          label: 'Resistance (R)',
          min: 10,
          max: 1000,
          default: 100,
          step: 10,
          unit: 'Ω',
          description: 'Total resistance of the circuit load/rheostat'
        }
      },
      presets: [
        {
          id: 'standard-9v',
          name: 'Standard 9V Bench Test',
          description: 'Common laboratory 9V supply with 100Ω load resistor.',
          voltage: 9.0,
          resistance: 100
        },
        {
          id: 'low-voltage',
          name: 'Low Voltage / Safe Bench',
          description: '3V supply demonstrating gentle current flow.',
          voltage: 3.0,
          resistance: 150
        },
        {
          id: 'high-resistance',
          name: 'High Resistance Demonstration',
          description: 'High resistance restricting current flow to minimal milliamperes.',
          voltage: 12.0,
          resistance: 600
        },
        {
          id: 'max-power',
          name: 'High Current / High Dissipation',
          description: 'Higher potential difference across low resistance yielding higher power.',
          voltage: 18.0,
          resistance: 40
        }
      ],
      suggestedQuestions: [
        'If I double the voltage while keeping resistance constant, what happens to the electric current and why?',
        'Why does increasing the circuit resistance cause the light bulb to dim?',
        'How is electrical power related to current and voltage in this circuit according to P = V × I?',
        'What would happen if the resistance approached zero ohms in a real-world circuit?'
      ]
    },
    {
      id: 'acid-base-titration',
      title: 'Acid-Base Neutralization Titration',
      subject: 'chemistry',
      subjectLabel: 'Chemistry',
      status: 'planned',
      level: 'Cambridge IGCSE / O Level / A Level',
      provisionalSyllabus: 'Cambridge IGCSE Chemistry (0620) Section 8.3 / O Level (5070)',
      syllabusVerificationNote: 'Provisional mapping — pending formal syllabus specification audit against official Cambridge publications.',
      icon: 'flask',
      summary: 'Determine the unknown concentration of an acid by careful neutralization with a standardized base using pH indicators.',
      description: 'Interactive virtual burette and conical flask setup with pH indicator color transitions and stoichiometric calculation graphing.',
      learningObjectives: [
        'Understand equivalence points and neutralization stoichiometry.',
        'Interpret titration curves and indicator endpoint color shifts.'
      ],
      formulas: [
        { label: 'Neutralization', formula: 'C₁V₁ = C₂V₂ (for 1:1 stoichiometry)', explanation: 'Concentration × Volume = Moles reacted' }
      ]
    },
    {
      id: 'photosynthesis-rate',
      title: 'Rate of Photosynthesis in Aquatic Plants',
      subject: 'biology',
      subjectLabel: 'Biology',
      status: 'planned',
      level: 'Cambridge IGCSE / O Level / A Level',
      provisionalSyllabus: 'Cambridge IGCSE Biology (0610) Section 6.2 / O Level (5090)',
      syllabusVerificationNote: 'Provisional mapping — pending formal syllabus specification audit against official Cambridge publications.',
      icon: 'activity',
      summary: 'Investigate the effect of light intensity, carbon dioxide concentration, and temperature on the rate of oxygen bubble production.',
      description: 'Virtual Elodea shoot apparatus with adjustable lamp distance, sodium hydrogen carbonate concentration, and bubble counter.',
      learningObjectives: [
        'Identify limiting factors of photosynthesis.',
        'Measure oxygen bubble frequency as a proxy for photosynthetic rate.'
      ],
      formulas: [
        { label: 'Photosynthesis Word Equation', formula: 'Carbon Dioxide + Water → Glucose + Oxygen', explanation: 'Light and chlorophyll catalyzed reaction' }
      ]
    }
  ];

  const LabsData = {
    /**
     * Retrieve all catalog experiments
     * @returns {Array<Object>}
     */
    getAllExperiments() {
      return EXPERIMENT_CATALOG.slice();
    },

    /**
     * Retrieve experiment by ID
     * @param {string} id
     * @returns {Object|null}
     */
    getExperimentById(id) {
      if (!id) return null;
      return EXPERIMENT_CATALOG.find(exp => exp.id === id) || null;
    },

    /**
     * Retrieve experiments by subject
     * @param {string} subject
     * @returns {Array<Object>}
     */
    getExperimentsBySubject(subject) {
      if (!subject) return [];
      return EXPERIMENT_CATALOG.filter(exp => exp.subject.toLowerCase() === subject.toLowerCase());
    },

    /**
     * Retrieve active experiments ready for user interaction
     * @returns {Array<Object>}
     */
    getActiveExperiments() {
      return EXPERIMENT_CATALOG.filter(exp => exp.status === 'active');
    }
  };

  return LabsData;
}));
