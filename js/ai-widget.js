/* ================================================================
   SmartTutors DeepTutor AI Chat Widget
   Socratic O/A Level & IGCSE Specialist
   ================================================================ */
(function () {
  'use strict';

  /* ── DOM refs ── */
  const fab     = document.getElementById('ai-fab');
  const drawer  = document.getElementById('ai-chat-drawer');
  const closeBtn= document.getElementById('ai-chat-close');
  const msgArea = document.getElementById('ai-chat-messages');
  const input   = document.getElementById('ai-chat-input');
  const sendBtn = document.getElementById('ai-chat-send');

  if (!fab || !drawer) return; // guard

  /* ── State ── */
  let isOpen = false;
  let isTyping = false;

  /* ── DeepTutor API endpoint (ngrok tunnel → local Docker) ── */
  const DEEPTUTOR_API_URL = 'https://lake-reliable-frugally.ngrok-free.dev/v1/chat/completions';

  /* ── Socratic placeholder bank ── */
  const SOCRATIC_HINTS = [
    "That is a great question! Before I answer directly, let me ask you: what do you already know about the key variables involved?",
    "Interesting! Let us break this down step by step. What is the first thing you would identify from the question's command word?",
    "Good thinking! In Cambridge marking schemes, this typically requires you to 'state' and then 'explain'. Can you try stating the definition first?",
    "Almost there! Think about what the examiner is really testing here. Which topic area does this fall under in your syllabus checklist?",
    "I want you to think critically about this. If you were the examiner, what key terms would you look for in a full-mark answer?",
    "Let us approach this using first principles. What is the fundamental law or equation that governs this scenario?",
    "Before we solve, let us plan. How many marks is this question worth? That tells us exactly how many distinct points the examiner expects.",
    "Excellent effort! Now, can you connect this concept back to a real-world example? Cambridge often rewards contextual application in Paper 2."
  ];

  let hintIndex = 0;

  /* ── Toggle drawer ── */
  function toggleDrawer() {
    isOpen = !isOpen;
    drawer.classList.toggle('ai-chat-open', isOpen);
    fab.classList.toggle('ai-fab-hidden', isOpen);
    if (isOpen) {
      setTimeout(() => input.focus(), 350);
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
    const bubble = document.createElement('div');
    bubble.className = 'ai-msg ai-msg-' + sender;

    const avatar = document.createElement('div');
    avatar.className = 'ai-msg-avatar ai-msg-avatar-' + sender;
    avatar.textContent = sender === 'user' ? 'You' : 'AI';

    const body = document.createElement('div');
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
    const el = document.createElement('div');
    el.className = 'ai-msg ai-msg-ai ai-typing-indicator';
    el.id = 'ai-typing';
    el.innerHTML = '<div class="ai-msg-avatar ai-msg-avatar-ai">AI</div>' +
      '<div class="ai-msg-body"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span></div>';
    msgArea.appendChild(el);
    msgArea.scrollTop = msgArea.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById('ai-typing');
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

    /* ── Live DeepTutor endpoint (ngrok tunnel → local Docker) ── */
    try {
      const response = await fetch(DEEPTUTOR_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          model: 'o-level-chemistry-mentor',
          messages: [
            {
              role: 'system',
              content: 'You are an elite, specialized Cambridge O-Level Chemistry instructor. You must strictly use the Socratic Method: NEVER give raw solutions, chemical formulas, or balanced equations directly. Instead, analyze their conceptual gap, reference the Chemistry 5070 syllabus, and respond with a single, targeted question or helpful hint about the chemical components to guide them to find the answer themselves.'
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

      const data = await response.json();
      const reply = data.choices
        && data.choices[0]
        && data.choices[0].message
        && data.choices[0].message.content;

      renderBubble(reply || 'I could not generate a response. Please try again.', 'ai');

    } catch (err) {
      // Fallback to local Socratic hint bank if API is unreachable
      hideTyping();
      console.warn('[DeepTutor] API error, falling back to local hints:', err.message);
      const hint = SOCRATIC_HINTS[hintIndex % SOCRATIC_HINTS.length];
      hintIndex++;
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
  let welcomed = false;
  fab.addEventListener('click', function onFirstOpen() {
    if (welcomed) return;
    welcomed = true;
    setTimeout(function () {
      renderBubble(
        "Assalamu Alaikum! I am your SmartTutors Socratic AI - a Cambridge O/A Level specialist. Ask me any concept, past-paper question, or exam technique query and I will guide you step by step. How can I help you today?",
        'ai'
      );
    }, 400);
  });

})();
