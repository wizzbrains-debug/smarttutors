/**
 * SmartTutors.online — Premium Interactions JS
 * Features: Navbar scroll, dark mode, mobile menu,
 *           dropdown, magnetic CTA, newsletter, scroll-to-top,
 *           accordion footer, country selector, analytics hooks,
 *           subject tabs, scroll-spy, animate-on-scroll
 */

'use strict';

/* ═══════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const on = (el, ev, fn, opts) => el?.addEventListener(ev, fn, opts);


/* ═══════════════════════════════════════════════
   DARK MODE
   ═══════════════════════════════════════════════ */
const DarkMode = (() => {
  const root = document.documentElement;
  const storageKey = 'st-theme';
  let isDark = false;

  function init() {
    const stored = localStorage.getItem(storageKey);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    isDark = stored ? stored === 'dark' : prefersDark;
    applyTheme();
  }

  function applyTheme() {
    root.classList.toggle('dark', isDark);
    updateToggleIcons();
  }

  function toggle() {
    isDark = !isDark;
    applyTheme();
    localStorage.setItem(storageKey, isDark ? 'dark' : 'light');

    // Animate transition
    root.style.transition = 'background-color 500ms, color 500ms';
    setTimeout(() => { root.style.transition = ''; }, 600);
  }

  function updateToggleIcons() {
    const mobileBtn = $('#mobile-theme-toggle');
    if (mobileBtn) {
      const icon = mobileBtn.querySelector('.mobile-theme-icon');
      if (icon) icon.textContent = isDark ? '☀️' : '🌙';
      mobileBtn.querySelector('span:last-child') && (
        mobileBtn.lastChild.textContent = isDark ? ' Switch to Light' : ' Switch to Dark'
      );
    }
  }

  on($('#theme-toggle'), 'click', toggle);
  on($('#mobile-theme-toggle'), 'click', () => { toggle(); MobileMenu.close(); });

  return { init, toggle, get isDark() { return isDark; } };
})();


/* ═══════════════════════════════════════════════
   NAVBAR SCROLL BEHAVIOR
   ═══════════════════════════════════════════════ */
const NavScroll = (() => {
  const nav = $('#navbar');
  if (!nav) return;

  let lastY = 0;
  let ticking = false;
  let scrolled = false;
  let hidden = false;
  const SCROLL_THRESHOLD = 40;
  const HIDE_THRESHOLD = 120;

  function update() {
    const currentY = window.scrollY;

    // Toggle scrolled glass effect
    if (currentY > SCROLL_THRESHOLD && !scrolled) {
      nav.classList.add('scrolled');
      scrolled = true;
    } else if (currentY <= SCROLL_THRESHOLD && scrolled) {
      nav.classList.remove('scrolled');
      scrolled = false;
    }

    // Hide/show on scroll direction
    if (currentY > HIDE_THRESHOLD) {
      if (currentY > lastY + 8 && !hidden) {
        nav.classList.add('nav-hidden');
        hidden = true;
      } else if (currentY < lastY - 4 && hidden) {
        nav.classList.remove('nav-hidden');
        hidden = false;
      }
    } else if (hidden) {
      nav.classList.remove('nav-hidden');
      hidden = false;
    }

    lastY = currentY;
    ticking = false;
  }

  on(window, 'scroll', () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
})();


/* ═══════════════════════════════════════════════
   PROGRAMS DROPDOWN
   ═══════════════════════════════════════════════ */
const Dropdown = (() => {
  const container = $('.nav-item-dropdown');
  const btn = $('#programs-btn');
  const menu = $('#programs-dropdown');
  if (!container || !menu) return;

  let openTimer, closeTimer;
  let isOpen = false;

  function open() {
    clearTimeout(closeTimer);
    openTimer = setTimeout(() => {
      isOpen = true;
      container.classList.add('open');
      btn?.setAttribute('aria-expanded', 'true');
    }, 200); // 200ms delay on hover
  }

  function close() {
    clearTimeout(openTimer);
    closeTimer = setTimeout(() => {
      isOpen = false;
      container.classList.remove('open');
      btn?.setAttribute('aria-expanded', 'false');
    }, 150);
  }

  on(container, 'mouseenter', open);
  on(container, 'mouseleave', close);

  // Keyboard nav
  on(btn, 'keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      isOpen ? close() : open();
    }
    if (e.key === 'Escape') close();
  });

  // Close when clicking outside
  on(document, 'click', (e) => {
    if (!container.contains(e.target)) close();
  });

  // Trap focus within dropdown
  on(menu, 'keydown', (e) => {
    if (e.key === 'Escape') { close(); btn?.focus(); }
  });
})();


/* ═══════════════════════════════════════════════
   MOBILE MENU
   ═══════════════════════════════════════════════ */
const MobileMenu = (() => {
  const menu = $('#mobile-menu');
  const panel = $('#mobile-panel');
  const hamburger = $('#hamburger');
  const closeBtn = $('#mobile-close');
  const backdrop = $('#mobile-backdrop');

  if (!menu) return { open() {}, close() {} };

  let touchStartX = 0;

  function open() {
    menu.hidden = false;
    // Allow display:block to settle before adding class
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { menu.classList.add('open'); });
    });
    hamburger?.classList.add('active');
    hamburger?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';

    // Focus trap
    setTimeout(() => closeBtn?.focus(), 350);
  }

  function close() {
    menu.classList.remove('open');
    hamburger?.classList.remove('active');
    hamburger?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';

    // Wait for animation then hide
    panel?.addEventListener('transitionend', () => {
      if (!menu.classList.contains('open')) menu.hidden = true;
    }, { once: true });
  }

  on(hamburger, 'click', open);
  on(closeBtn, 'click', close);
  on(backdrop, 'click', close);

  // Close on escape
  on(document, 'keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('open')) close();
  });

  // Swipe to close
  on(panel, 'touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  on(panel, 'touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (dx > 60) close(); // swipe right
  }, { passive: true });

  return { open, close };
})();


/* ═══════════════════════════════════════════════
   MOBILE MENU — Auto-close on nav link click
   ═══════════════════════════════════════════════ */
$$('.mobile-nav-link').forEach(link => {
  on(link, 'click', () => {
    MobileMenu.close();
  });
});


/* ═══════════════════════════════════════════════
   MAGNETIC BUTTON EFFECT
   ═══════════════════════════════════════════════ */
const MagneticBtn = (() => {
  const btn = $('#cta-btn');
  if (!btn || window.matchMedia('(max-width: 767px)').matches) return;

  const STRENGTH = 0.25;
  let rafId;

  on(btn, 'mousemove', (e) => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) * STRENGTH;
      const dy = (e.clientY - cy) * STRENGTH;
      btn.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
    });
  });

  on(btn, 'mouseleave', () => {
    if (rafId) cancelAnimationFrame(rafId);
    btn.style.transform = '';
  });
})();


/* ═══════════════════════════════════════════════
   ACTIVE NAV LINK — click-based
   ═══════════════════════════════════════════════ */
const ActiveLink = (() => {
  const links = $$('.nav-link:not(.dropdown-trigger)');
  on(document, 'click', (e) => {
    const link = e.target.closest('.nav-link:not(.dropdown-trigger), .mobile-nav-link');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || !href.startsWith('#')) return;
    links.forEach(l => {
      l.classList.remove('active-link');
      l.classList.remove('active-scroll');
    });
    // Highlight matching desktop link
    links.forEach(l => {
      if (l.getAttribute('href') === href) {
        l.classList.add('active-link');
      }
    });
  });
})();


/* ═══════════════════════════════════════════════
   NEWSLETTER FORM
   ═══════════════════════════════════════════════ */
const Newsletter = (() => {
  const form = $('#newsletter-form');
  const input = $('#newsletter-email');
  const btn = $('#newsletter-submit');
  if (!form) return;

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  function showError() {
    input.style.borderColor = '#ef4444';
    input.style.boxShadow = '0 0 0 4px rgba(239,68,68,0.15)';
    input.animate([
      { transform: 'translateX(0)' },
      { transform: 'translateX(-6px)' },
      { transform: 'translateX(6px)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(0)' },
    ], { duration: 350, easing: 'ease-out' });
  }

  function resetError() {
    input.style.borderColor = '';
    input.style.boxShadow = '';
  }

  on(input, 'input', resetError);

  on(form, 'submit', async (e) => {
    e.preventDefault();

    if (!isValidEmail(input.value)) {
      showError();
      input.focus();
      return;
    }

    btn.disabled = true;
    btn.style.opacity = '0.7';

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 900));

    btn.classList.add('success');
    btn.disabled = false;
    btn.style.opacity = '';
    const emailDomain = input.value.split('@')[1];
    input.value = '';

    trackEvent('newsletter_subscribe', { email_domain: emailDomain });

    // Reset after 4s
    setTimeout(() => { btn.classList.remove('success'); }, 4000);
  });
})();


/* ═══════════════════════════════════════════════
   SCROLL TO TOP
   ═══════════════════════════════════════════════ */
const ScrollTop = (() => {
  const btn = $('#scroll-to-top');
  if (!btn) return;

  const SHOW_AT = 500;
  let visible = false;

  on(window, 'scroll', () => {
    const shouldShow = window.scrollY > SHOW_AT;
    if (shouldShow !== visible) {
      visible = shouldShow;
      btn.hidden = !visible;
    }
  }, { passive: true });

  on(btn, 'click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();


/* ═══════════════════════════════════════════════
   FOOTER ACCORDION (Mobile)
   ═══════════════════════════════════════════════ */
const FooterAccordion = (() => {
  if (window.innerWidth > 639) return;

  $$('.footer-col:not(.footer-brand-col)').forEach(col => {
    const trigger = col.querySelector('.accordion-trigger');
    if (!trigger) return;

    on(trigger, 'click', () => {
      const isOpen = col.classList.contains('open');
      // Close others
      $$('.footer-col.open').forEach(c => c.classList.remove('open'));
      if (!isOpen) col.classList.add('open');
    });
  });
})();


/* ═══════════════════════════════════════════════
   COUNTRY SELECTOR
   ═══════════════════════════════════════════════ */
const CountrySelector = (() => {
  const selector = $('#country-selector');
  const btn = $('#country-btn');
  const dropdown = $('#country-dropdown');
  const flagEl = $('#selected-flag');
  const countryEl = $('#selected-country');
  if (!selector) return;

  function open() {
    selector.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  }

  function close() {
    selector.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  on(btn, 'click', (e) => {
    e.stopPropagation();
    selector.classList.contains('open') ? close() : open();
  });

  on(document, 'click', (e) => {
    if (!selector.contains(e.target)) close();
  });

  $$('[role="option"]', dropdown).forEach(option => {
    on(option, 'click', () => {
      flagEl.textContent = option.dataset.flag;
      countryEl.textContent = option.dataset.label;
      close();
      trackEvent('country_select', { country: option.dataset.label });
    });
  });
})();


/* ═══════════════════════════════════════════════
   SMOOTH SCROLL FOR ANCHOR LINKS
   ═══════════════════════════════════════════════ */
window.smoothScrollTop = function(e) {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

$$('a[href^="#"]').forEach(anchor => {
  on(anchor, 'click', (e) => {
    const href = anchor.getAttribute('href');
    if (!href || href === '#') return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    const navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 72;
    const top = target.getBoundingClientRect().top + window.scrollY - navH - 8;
    window.scrollTo({ top, behavior: 'smooth' });

    // Close mobile menu if open
    MobileMenu.close();
  });
});


/* ═══════════════════════════════════════════════
   ANIMATE ON SCROLL — IntersectionObserver
   ═══════════════════════════════════════════════ */
const AnimateOnScroll = (() => {
  const targets = $$('[data-animate], .trust-badge, .social-icon, .footer-link, .contact-link, .newsletter-section');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const delay = el.dataset.delay ? parseInt(el.dataset.delay) : 0;
        setTimeout(() => {
          el.classList.add('animated', 'in-view');
        }, delay);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  targets.forEach(el => observer.observe(el));
})();


/* ═══════════════════════════════════════════════
   SUBJECT TABS
   ═══════════════════════════════════════════════ */
const SubjectTabs = (() => {
  const tabs = $$('.subject-tab');
  const panels = $$('.subject-panel');
  if (!tabs.length) return;

  function activate(tab) {
    const targetId = tab.getAttribute('aria-controls');

    // Update tabs
    tabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');

    // Update panels
    panels.forEach(p => {
      if (p.id === targetId) {
        p.hidden = false;
        // Trigger animation
        p.classList.remove('animated');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => p.classList.add('animated'));
        });
      } else {
        p.hidden = true;
      }
    });

    trackEvent('subject_tab_click', { subject: tab.dataset.subject });
  }

  tabs.forEach(tab => {
    on(tab, 'click', () => activate(tab));

    // Keyboard: arrow navigation
    on(tab, 'keydown', (e) => {
      const idx = tabs.indexOf(tab);
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = tabs[(idx + 1) % tabs.length];
        activate(next);
        next.focus();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
        activate(prev);
        prev.focus();
      }
    });
  });

  // Activate first panel on load
  if (panels[0]) panels[0].classList.add('animated');
})();


/* ═══════════════════════════════════════════════
   SCROLL SPY — Highlight active nav link
   using IntersectionObserver
   ═══════════════════════════════════════════════ */
const ScrollSpy = (() => {
  const sections = $$('section[id]');
  const navLinks = $$('.nav-link[data-section]');
  if (!sections.length || !navLinks.length) return;

  const NAV_H = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--nav-height')) || 72;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;

      navLinks.forEach(link => {
        const isMatch = link.getAttribute('data-section') === id ||
                        link.getAttribute('href') === `#${id}`;
        link.classList.toggle('active-link', isMatch);
        link.classList.toggle('active-scroll', isMatch);
      });
    });
  }, {
    rootMargin: `-${NAV_H + 20}px 0px -55% 0px`,
    threshold: 0,
  });

  sections.forEach(s => observer.observe(s));
})();


/* ═══════════════════════════════════════════════
   ANALYTICS STUB (replace with real tracker)
   ═══════════════════════════════════════════════ */
function trackEvent(event, data = {}) {
  // Replace with: gtag('event', event, data) or similar
  if (typeof window.gtag === 'function') {
    window.gtag('event', event, data);
  }
  console.debug('[SmartTutors Analytics]', event, data);
}

// Track all nav/footer link clicks
$$('.nav-link, .footer-link, .social-icon, .cta-btn').forEach(el => {
  on(el, 'click', () => {
    trackEvent('link_click', {
      label: el.textContent.trim() || el.getAttribute('aria-label'),
      href: el.getAttribute('href'),
    });
  });
});


/* ═══════════════════════════════════════════════
   PARALLAX — Footer Blobs
   ═══════════════════════════════════════════════ */
const FooterParallax = (() => {
  const blob1 = $('.footer-blob-1');
  const blob2 = $('.footer-blob-2');
  const footer = $('#site-footer');
  if (!blob1 || !blob2 || !footer) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  on(window, 'scroll', () => {
    requestAnimationFrame(() => {
      const rect = footer.getBoundingClientRect();
      const progress = 1 - Math.min(1, Math.max(0, rect.top / window.innerHeight));
      blob1.style.transform = `translateY(${progress * -40}px)`;
      blob2.style.transform = `translateY(${progress * 30}px)`;
    });
  }, { passive: true });
})();


/* ═══════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════ */
DarkMode.init();

// Ensure body padding accounts for nav
document.body.style.paddingTop = getComputedStyle(document.documentElement)
  .getPropertyValue('--nav-height').trim() || '72px';


/* ═══════════════════════════════════════════════
   CURRENCY ENGINE
   Auto-detects visitor's country → fetches live
   exchange rate → converts and displays local price
   alongside USD reference subtext.
   Falls back gracefully on any API failure.
   ═══════════════════════════════════════════════ */
const CurrencyEngine = (() => {
  'use strict';

  /* ── Base prices in USD ── */
  const BASE_USD = {
    group: 49,
    solo:  150,
  };

  /* ── Supported currency configurations ──
     symbol      : displayed prefix
     locale      : Intl.NumberFormat locale for comma formatting
     decimals    : decimal places to show
     label       : human-readable country label for console
     roundTo     : round converted amount to nearest N (0 = no rounding)
  ── */
  const CURRENCY_CONFIG = {
    PKR: { symbol: 'Rs.',  locale: 'en-PK', decimals: 0, label: 'Pakistan',     roundTo: 100  },
    AED: { symbol: 'AED',  locale: 'en-AE', decimals: 0, label: 'UAE',          roundTo: 5    },
    SAR: { symbol: 'SAR',  locale: 'ar-SA', decimals: 0, label: 'Saudi Arabia', roundTo: 5    },
    GBP: { symbol: '£',    locale: 'en-GB', decimals: 0, label: 'UK',           roundTo: 1    },
    EUR: { symbol: '€',    locale: 'de-DE', decimals: 0, label: 'Europe',       roundTo: 1    },
    CAD: { symbol: 'CA$',  locale: 'en-CA', decimals: 0, label: 'Canada',       roundTo: 1    },
    AUD: { symbol: 'A$',   locale: 'en-AU', decimals: 0, label: 'Australia',    roundTo: 1    },
    INR: { symbol: '₹',    locale: 'en-IN', decimals: 0, label: 'India',        roundTo: 50   },
    BDT: { symbol: '৳',    locale: 'bn-BD', decimals: 0, label: 'Bangladesh',   roundTo: 100  },
    MYR: { symbol: 'RM',   locale: 'ms-MY', decimals: 0, label: 'Malaysia',     roundTo: 1    },
    SGD: { symbol: 'S$',   locale: 'en-SG', decimals: 0, label: 'Singapore',    roundTo: 1    },
    QAR: { symbol: 'QAR',  locale: 'ar-QA', decimals: 0, label: 'Qatar',        roundTo: 5    },
    KWD: { symbol: 'KWD',  locale: 'ar-KW', decimals: 2, label: 'Kuwait',       roundTo: 0    },
    OMR: { symbol: 'OMR',  locale: 'ar-OM', decimals: 2, label: 'Oman',         roundTo: 0    },
    BHD: { symbol: 'BHD',  locale: 'ar-BH', decimals: 2, label: 'Bahrain',      roundTo: 0    },
    EGP: { symbol: 'EGP',  locale: 'ar-EG', decimals: 0, label: 'Egypt',        roundTo: 10   },
    TRY: { symbol: '₺',    locale: 'tr-TR', decimals: 0, label: 'Turkey',       roundTo: 10   },
    NGN: { symbol: '₦',    locale: 'en-NG', decimals: 0, label: 'Nigeria',      roundTo: 100  },
    ZAR: { symbol: 'R',    locale: 'en-ZA', decimals: 0, label: 'South Africa', roundTo: 5    },
    NZD: { symbol: 'NZ$',  locale: 'en-NZ', decimals: 0, label: 'New Zealand',  roundTo: 1    },
  };

  /* ── localStorage cache keys & TTL (24 hours) ── */
  const CACHE_KEY_RATE = 'st_fx_rates';
  const CACHE_KEY_META = 'st_fx_meta';  // { currency, ts }
  const CACHE_TTL_MS   = 24 * 60 * 60 * 1000;

  /* ── DOM refs ── */
  const elGroupStrong = document.getElementById('price-group');
  const elGroupRef    = document.getElementById('price-group-ref');
  const elSoloStrong  = document.getElementById('price-solo');
  const elSoloRef     = document.getElementById('price-solo-ref');

  /* ── Format a number with locale-appropriate thousands separators ── */
  function formatAmount(amount, cfg) {
    let rounded = cfg.roundTo > 0
      ? Math.round(amount / cfg.roundTo) * cfg.roundTo
      : amount;

    return new Intl.NumberFormat(cfg.locale, {
      minimumFractionDigits: cfg.decimals,
      maximumFractionDigits: cfg.decimals,
    }).format(rounded);
  }

  /* ── Apply converted prices to the DOM ── */
  function applyPrices(currency, rates) {
    const cfg = CURRENCY_CONFIG[currency];
    if (!cfg || !rates[currency]) {
      // Unsupported currency — leave USD defaults as-is
      console.debug(`[CurrencyEngine] ${currency} not in config — showing USD defaults.`);
      return;
    }

    const rate       = rates[currency];
    const groupLocal = BASE_USD.group * rate;
    const soloLocal  = BASE_USD.solo  * rate;

    const groupFmt = formatAmount(groupLocal, cfg);
    const soloFmt  = formatAmount(soloLocal,  cfg);

    // Update price strong tags
    if (elGroupStrong) elGroupStrong.textContent = `${cfg.symbol} ${groupFmt}`;
    if (elSoloStrong)  elSoloStrong.textContent  = `${cfg.symbol} ${soloFmt}`;

    // Inject USD reference subtext
    if (elGroupRef) {
      elGroupRef.textContent  = `(~$${BASE_USD.group} USD)`;
      elGroupRef.style.cssText = 'display:block;font-size:11px;color:#94a3b8;margin-top:3px;letter-spacing:0.02em;';
    }
    if (elSoloRef) {
      elSoloRef.textContent  = `(~$${BASE_USD.solo} USD)`;
      elSoloRef.style.cssText = 'display:block;font-size:11px;color:#94a3b8;margin-top:3px;letter-spacing:0.02em;';
    }

    console.debug(`[CurrencyEngine] Applied ${currency} — Group: ${cfg.symbol}${groupFmt}, Solo: ${cfg.symbol}${soloFmt} (rate: ${rate})`);
  }

  /* ── Load from cache if still fresh ── */
  function loadCache() {
    try {
      const meta  = JSON.parse(localStorage.getItem(CACHE_KEY_META) || 'null');
      const rates = JSON.parse(localStorage.getItem(CACHE_KEY_RATE) || 'null');
      if (!meta || !rates) return null;
      if (Date.now() - meta.ts > CACHE_TTL_MS) return null; // stale
      return { currency: meta.currency, rates };
    } catch { return null; }
  }

  /* ── Persist to cache ── */
  function saveCache(currency, rates) {
    try {
      localStorage.setItem(CACHE_KEY_RATE, JSON.stringify(rates));
      localStorage.setItem(CACHE_KEY_META, JSON.stringify({ currency, ts: Date.now() }));
    } catch { /* quota full — ignore */ }
  }

  /* ── Main async pipeline ── */
  async function run() {
    // 1. Try localStorage cache first (avoids API calls on return visits)
    const cached = loadCache();
    if (cached) {
      console.debug('[CurrencyEngine] Using cached rates for', cached.currency);
      applyPrices(cached.currency, cached.rates);
      return;
    }

    // 2. Geo-IP detection — find visitor's currency code
    //    Using ip-api.com (CORS-friendly, no key required)
    //    Returns countryCode (ISO 3166-1 alpha-2), so we map to currency.
    const COUNTRY_TO_CURRENCY = {
      PK: 'PKR', AE: 'AED', SA: 'SAR', GB: 'GBP', QA: 'QAR',
      KW: 'KWD', OM: 'OMR', BH: 'BHD', EG: 'EGP', TR: 'TRY',
      IN: 'INR', BD: 'BDT', MY: 'MYR', SG: 'SGD', NG: 'NGN',
      ZA: 'ZAR', NZ: 'NZD', AU: 'AUD', CA: 'CAD',
      // Eurozone
      DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR',
      BE: 'EUR', AT: 'EUR', PT: 'EUR', IE: 'EUR', FI: 'EUR',
      GR: 'EUR', LU: 'EUR', SK: 'EUR', SI: 'EUR', EE: 'EUR',
      LV: 'EUR', LT: 'EUR', CY: 'EUR', MT: 'EUR', HR: 'EUR',
    };

    let currency = 'USD';
    try {
      const geoRes = await fetch('https://ipinfo.io/json', {
        signal: AbortSignal.timeout(5000),
      });
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData.country) {
          const cc = geoData.country.toUpperCase();
          currency = COUNTRY_TO_CURRENCY[cc] || 'USD';
          console.debug(`[CurrencyEngine] Detected: ${geoData.city}, ${geoData.region} (${cc}) → ${currency}`);
        }
      }
    } catch (err) {
      console.warn('[CurrencyEngine] Geo-IP failed — defaulting to USD:', err.message);
      return; // Graceful fallback: leave USD defaults untouched
    }

    // USD visitors — no conversion needed
    if (currency === 'USD') {
      console.debug('[CurrencyEngine] Visitor is USD — no conversion needed.');
      return;
    }

    // Currency not in our support list — skip silently
    if (!CURRENCY_CONFIG[currency]) {
      console.debug(`[CurrencyEngine] ${currency} not supported — showing USD defaults.`);
      return;
    }

    // 3. Fetch live exchange rates (base: USD)
    try {
      const fxRes = await fetch('https://open.er-api.com/v6/latest/USD', {
        signal: AbortSignal.timeout(6000),
      });
      if (!fxRes.ok) throw new Error(`HTTP ${fxRes.status}`);
      const fxData = await fxRes.json();

      if (fxData.result !== 'success' || !fxData.rates) {
        throw new Error('Invalid FX API response');
      }

      const rates = fxData.rates;

      // 4. Cache the result and apply to DOM
      saveCache(currency, rates);
      applyPrices(currency, rates);

    } catch (err) {
      console.warn('[CurrencyEngine] FX rate fetch failed — showing USD defaults:', err.message);
      // Graceful fallback: original USD pricing already in the DOM, no action needed
    }
  }

  // Run after DOM is fully loaded, non-blocking
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    // Slight defer so it doesn't compete with critical render
    setTimeout(run, 200);
  }

  return { run }; // expose for manual testing: CurrencyEngine.run()
})();

