^K
 label: 'Mathematics',
      model: 'o-level-math-mentor',
      prompt: 'You are an elite, specialized Cambridge O-Level Mathematics instructor (Syllabus 4024). You must strictly use the Socratic Method: NEVER give raw solutions, final answers, or fully worked calculations directly. Instead, analyze the student\'s conceptual gap, reference the Mathematics 4024 syllabus topics (Number, Algebra, Geometry, Mensuration, Coordinate Geometry, Trigonometry, Vectors, Statistics, Probability, Matrices), and respond with a single, targeted question or helpful hint about the mathematical reasoning to guide them to find the answer themselves. Keep responses concise and encouraging.'
    },
    biology: {
      label: 'Biology',
      model: 'o-level-biology-mentor',
      prompt: 'You are an elite, specialized Cambridge O-Level Biology instructor (Syllabus 5090). You must strictly use the Socratic Method: NEVER give raw definitions, diagram labels, or direct textbook answers. Instead, analyze the student\'s conceptual gap, reference the Biology 5090 syllabus topics (Cell Structure, Biological Molecules, Enzymes, Nutrition, Transport, Respiration, Reproduction, Inheritance, Ecology, Human Physiology), and respond with a single, targeted question or helpful hint about the biological mechanisms to guide them to find the answer themselves. Keep responses concise and encouraging.'
    },
    english: {
      label: 'English',
      model: 'o-level-english-mentor',
      prompt: 'You are an elite, specialized Cambridge O-Level English Language instructor (Syllabus 1123). You must strictly use the Socratic Method: NEVER write full essays, paragraphs, or direct model answers. Instead, analyze the student\'s writing gap, reference the English 1123 syllabus skills (Reading Comprehension, Summary Writing, Narrative Writing, Argumentative/Discursive Writing, Grammar & Vocabulary, Directed Writing), and respond with a single, targeted question or helpful hint about their language technique, structure, or expression to guide them to improve their answer themselves. Keep responses concise and encouraging.'
    }
  };
^K
    "Good effort! Cambridge often asks you to 'describe' or 'explain'. These are different command words - which one fits here?",
      "Excellent thinking! Can you link this reaction to an industrial application? Paper 2 often rewards real-world context."
    ],
    math: [
      "Good start! Look at the equation. What operation would you use first to isolate the unknown variable?",
      "Before solving, can you identify what type of problem this is - linear, quadratic, simultaneous, or trigonometric?",
      "Think about inverse operations. If something was multiplied, what must you do to both sides to undo it?",
      "Let us plan the method. How many marks is this worth? That tells you how many working steps the examiner expects to see.",
      "Can you sketch a quick diagram or number line? Visualising the problem often reveals the approach.",
      "Almost! Check your units carefully. Are you working in the same units throughout, or do you need to convert?",
      "What formula from the 4024 syllabus applies here? Write it out first, then substitute your known values.",
      "Great work so far! Now verify your answer - does it make sense if you substitute it back into the original equation?"
    ],
    physics: [
      "Let us start by identifying the forces acting on the object. Can you name at least two and their directions?",
      "What physical quantity is the question really asking about - force, energy, momentum, or something else?",
      "Before calculating, which equation from the 5054 formula sheet connects the variables you have been given?",
      "Think about units. What are the SI units for the quantity you need to find? This often hints at which formula to use.",
      "Good thinking! Is energy conserved in this scenario? If so, can you set up an equation showing energy before equals energy after?",
      "The examiner wants you to 'explain' - that means state the physics principle AND link it to this specific situation. What principle applies?",
      "Can you draw a free-body diagram showing all the forces? Label their magnitudes and directions.",
      "Nearly there! Does your numerical answer have a sensible magnitude? A car travelling at 5000 m/s should raise a red flag."
    ],
    biology: [
      "Interesting question! Let us start with structure. Can you describe the key parts of the cell or organ involved?",
      "Think about function. Why does this biological structure exist? What role does it play in the organism?",
      "Which process is at work here - diffusion, osmosis, active transport, or something else? What evidence tells you?",
      "The 5090 syllabus expects you to know the difference between 'state' and 'explain'. Which command word is used here?",
      "Can you trace the pathway step by step? For example, where does the substance enter, and where does it end up?",
      "Good thinking! Now consider the control variable. What would happen if this factor was changed or removed?",
      "Almost! Think about adaptation. How is this structure specifically suited to its function? Name at least two features.",
      "Excellent effort! Cambridge loves comparison questions. Can you contrast this process with a similar one?"
    ],
    english: [
      "Good start! Before writing, let us plan. What is the purpose of this piece - to argue, persuade, describe, or narrate?",
      "Think about your audience. Who are you writing for, and how should that shape your tone and vocabulary?",
      "The 1123 syllabus rewards structure. Can you outline three clear paragraph points before you begin drafting?",
      "Look at the passage again. What language technique has the writer used here - metaphor, simile, personification, or alliteration?",
      "What effect does that technique create for the reader? Try to explain the impact using phrases like 'this suggests' or 'this conveys'.",
      "For your summary, remember: you need to identify points AND rephrase them in your own words. Can you pick out the key facts first?",
      "Good work! Now check your connectives. Are you using a range - 'however', 'furthermore', 'consequently' - or repeating the same ones?",
      "Nearly perfect! Read your final sentence aloud. Does it leave a strong impression? A powerful conclusion can lift your entire response."
    ]
  };

  var fallbackIndexes = { chemistry: 0, math: 0, physics: 0, biology: 0, english: 0 };

  /* ── Inject Subject Selector into header ── */
  (function injectSubjectSelector() {
    const header = drawer.querySelector('.ai-chat-header');
    if (!header) return;

    const selector = document.createElement('div');
    selector.className = 'ai-subject-selector';
    selector.innerHTML =
      '<select id="ai-subject-select" class="ai-subject-dropdown" aria-label="Select subject">' +
        '<option value="chemistry">Chemistry</option>' +
        '<option value="physics">Physics</option>' +
        '<option value="math">Mathematics</option>' +
        '<option value="biology">Biology</option>' +
        '<option value="english">English</option>' +
      '</select>';

    // Insert after header, before messages
    header.insertAdjacentElement('afterend', selector);

    // Bind change listener
    var select = document.getElementById('ai-subject-select');
    select.addEventListener('change', function () {
      activeSubject = this.value;
      var subj = SUBJECT_PROMPTS[activeSubject];
      renderBubble('Switched to ' + subj.label + ' mode. Ask me anything from the ' + subj.label + ' syllabus!', 'ai');
    });
  })();

  /* ── Toggle drawer ── */
  function toggleDrawer() {
    isOpen = !isOpen;
    drawer.classList.toggle('ai-chat-open', isOpen);
    fab.classList.toggle('ai-fab-hidden', isOpen);
    if (isOpen) {
      setTimeout(function () { input.focus(); }, 350);
    }
  }

  fab.addEventListener('click', toggleDrawer);
  closeBtn.addEventListener('click', toggleDrawer);

  /* ── Close on Escape ── */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) toggleDrawer();
  });

  /* ── Render a message bubble ── */
  function renderBubble(text, sender) {
    var bubble = document.createElement('div');
    bubble.className = 'ai-msg ai-msg-' + sender;

    var avatar = document.createElement('div');
    avatar.className = 'ai-msg-avatar ai-msg-avatar-' + sender;
    avatar.textContent = sender === 'user' ? 'You' : 'AI';

    var body = document.createElement('div');
    body.className = 'ai-msg-body';
    body.textContent = text;

    bubble.appendChild(avatar);
    bubble.appendChild(body);
    msgArea.appendChild(bubble);
    msgArea.scrollTop = msgArea.scrollHeight;
    return bubble;
  }

  /* ── Typing indicator ── */
  function showTyping() {
    var el = document.createElement('div');
    el.className = 'ai-msg ai-msg-ai ai-typing-indicator';
    el.id = 'ai-typing';
    el.innerHTML = '<div class="ai-msg-avatar ai-msg-avatar-ai">AI</div>' +
      '<div class="ai-msg-body"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span></div>';
    msgArea.appendChild(el);
    msgArea.scrollTop = msgArea.scrollHeight;
  }

  function hideTyping() {
    var el = document.getElementById('ai-typing');
    if (el) el.remove();
  }

  /* ── Core send handler ── */
  async function sendMessageToDeepTutor(studentText) {
    if (!studentText.trim() || isTyping) return;
    isTyping = true;

    // Render user bubble
    renderBubble(studentText, 'user');
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    // Show typing indicator
    showTyping();

    /* ── Resolve active subject config ── */
    var subj = SUBJECT_PROMPTS[activeSubject];

    /* ── Live DeepTutor endpoint (ngrok tunnel -> local Docker) ── */
    try {
      var response = await fetch(DEEPTUTOR_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          model: subj.model,
          messages: [
            {
              role: 'system',
              content: subj.prompt
            },
            {
              role: 'user',
              content: studentText
            }
          ],
          stream: false
        })
      });

      hideTyping();

      if (!response.ok) {
        throw new Error('API responded with status ' + response.status);
      }

      var data = await response.json();
      var reply = data.choices
        && data.choices[0]
        && data.choices[0].message
        && data.choices[0].message.content;

      renderBubble(reply || 'I could not generate a response. Please try again.', 'ai');

    } catch (err) {
      // Fallback to subject-specific local hint bank if API is unreachable
      hideTyping();
      console.warn('[DeepTutor] API error, falling back to local hints:', err.message);
      var pool = LOCAL_FALLBACKS[activeSubject] || LOCAL_FALLBACKS.chemistry;
      var idx = fallbackIndexes[activeSubject] || 0;
      var hint = pool[idx % pool.length];
      fallbackIndexes[activeSubject] = idx + 1;
      renderBubble(hint, 'ai');
    }

    isTyping = false;
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }

  /* ── Event bindings ── */
  sendBtn.addEventListener('click', function () {
    sendMessageToDeepTutor(input.value);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessageToDeepTutor(input.value);
    }
  });

  /* ── Welcome message on first open ── */
  var welcomed = false;
  fab.addEventListener('click', function onFirstOpen() {
    if (welcomed) return;
    welcomed = true;
    setTimeout(function () {
      renderBubble(
        'Assalamu Alaikum! I am your SmartTutors Socratic AI - a Cambridge O/A Level specialist. Select your subject above and ask me any concept, past-paper question, or exam technique query. I will guide you step by step!',
        'ai'
      );
    }, 400);
  });

})();
