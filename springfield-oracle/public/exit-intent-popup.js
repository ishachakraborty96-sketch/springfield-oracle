/**
 * Exit Intent Popup — Vanilla JS Component
 * Mounts a modal popup when user moves mouse toward top of page to leave
 *
 * Usage:
 *   <script src="/exit-intent-popup.js"></script>
 *   <script>
 *     ExitIntentPopup.init({
 *       onSubscribe: (email) => {
 *         // Call your backend API here
 *         fetch('/api/subscribe', { method: 'POST', body: JSON.stringify({ email }) })
 *       }
 *     });
 *   </script>
 */

const ExitIntentPopup = (() => {
  let exitTriggered = false;

  const createStyles = () => {
    if (document.getElementById('exit-intent-styles')) return;

    const style = document.createElement('style');
    style.id = 'exit-intent-styles';
    style.textContent = `
      :root {
        --gold: #C9A84C;
        --gold-light: #E8C97A;
        --cream: #F5EDD6;
        --dark: #0A0804;
        --dark-card: #1A1710;
        --border: rgba(201, 168, 76, 0.25);
        --text-muted: rgba(245, 237, 214, 0.45);
      }

      .exit-intent-overlay {
        position: fixed;
        inset: 0;
        background: rgba(5, 4, 2, 0.88);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        opacity: 0;
        animation: exitIntentFadeIn 0.4s ease 0.1s forwards;
      }

      @keyframes exitIntentFadeIn {
        to { opacity: 1; }
      }

      .exit-intent-overlay::before {
        content: '';
        position: fixed;
        inset: 0;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
        pointer-events: none;
        z-index: -1;
      }

      .exit-intent-modal {
        position: relative;
        background: var(--dark-card);
        border: 1px solid var(--border);
        max-width: 540px;
        width: 100%;
        overflow: hidden;
        transform: translateY(24px) scale(0.97);
        animation: exitIntentSlideUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.15s forwards;
      }

      @keyframes exitIntentSlideUp {
        to { transform: translateY(0) scale(1); }
      }

      .exit-intent-modal::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 2px;
        background: linear-gradient(90deg, transparent, var(--gold), var(--gold-light), var(--gold), transparent);
      }

      .exit-intent-corner {
        position: absolute;
        width: 20px;
        height: 20px;
        opacity: 0.5;
      }
      .exit-intent-corner-tl { top: 8px; left: 8px; border-top: 1px solid var(--gold); border-left: 1px solid var(--gold); }
      .exit-intent-corner-tr { top: 8px; right: 8px; border-top: 1px solid var(--gold); border-right: 1px solid var(--gold); }
      .exit-intent-corner-bl { bottom: 8px; left: 8px; border-bottom: 1px solid var(--gold); border-left: 1px solid var(--gold); }
      .exit-intent-corner-br { bottom: 8px; right: 8px; border-bottom: 1px solid var(--gold); border-right: 1px solid var(--gold); }

      .exit-intent-close-btn {
        position: absolute;
        top: 16px; right: 18px;
        background: none;
        border: none;
        color: var(--text-muted);
        font-family: 'Space Mono', monospace;
        font-size: 11px;
        letter-spacing: 0.15em;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 0;
        transition: color 0.2s;
      }
      .exit-intent-close-btn:hover { color: var(--cream); }
      .exit-intent-close-btn span { font-size: 16px; line-height: 1; }

      .exit-intent-modal-inner {
        padding: 48px 44px 40px;
      }

      .exit-intent-eye-icon {
        display: block;
        margin: 0 auto 22px;
        width: 42px;
        height: 42px;
        opacity: 0.9;
      }

      .exit-intent-pupil {
        animation: exitIntentEyeMove 4s ease-in-out infinite;
        transform-origin: center;
      }
      @keyframes exitIntentEyeMove {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(3px); }
        75% { transform: translateX(-3px); }
      }

      .exit-intent-eyebrow-label {
        text-align: center;
        font-family: 'Space Mono', monospace;
        font-size: 10px;
        letter-spacing: 0.25em;
        color: var(--gold);
        text-transform: uppercase;
        margin-bottom: 14px;
      }

      .exit-intent-headline {
        font-family: 'Playfair Display', serif;
        font-size: 30px;
        font-weight: 900;
        line-height: 1.18;
        text-align: center;
        color: var(--cream);
        margin-bottom: 14px;
      }
      .exit-intent-headline em {
        font-style: italic;
        color: var(--gold-light);
      }

      .exit-intent-subtext {
        font-size: 14px;
        line-height: 1.65;
        color: var(--text-muted);
        text-align: center;
        margin-bottom: 28px;
        font-weight: 300;
        max-width: 380px;
        margin-left: auto;
        margin-right: auto;
      }
      .exit-intent-subtext strong {
        color: rgba(245, 237, 214, 0.75);
        font-weight: 500;
      }

      .exit-intent-divider {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 24px;
      }
      .exit-intent-divider-line {
        flex: 1;
        height: 1px;
        background: var(--border);
      }
      .exit-intent-divider-dot {
        width: 4px;
        height: 4px;
        background: var(--gold);
        transform: rotate(45deg);
        opacity: 0.6;
      }

      .exit-intent-form-row {
        display: flex;
        gap: 10px;
        margin-bottom: 14px;
      }

      .exit-intent-email-input {
        flex: 1;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(201, 168, 76, 0.2);
        color: var(--cream);
        font-family: 'DM Sans', sans-serif;
        font-size: 14px;
        padding: 13px 16px;
        outline: none;
        transition: border-color 0.25s, background 0.25s;
        caret-color: var(--gold);
      }
      .exit-intent-email-input::placeholder {
        color: rgba(245, 237, 214, 0.25);
        font-style: italic;
      }
      .exit-intent-email-input:focus {
        border-color: rgba(201, 168, 76, 0.6);
        background: rgba(255,255,255,0.06);
      }

      .exit-intent-submit-btn {
        background: var(--gold);
        color: var(--dark);
        border: none;
        font-family: 'Space Mono', monospace;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        padding: 13px 22px;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.2s, transform 0.15s;
        position: relative;
        overflow: hidden;
      }
      .exit-intent-submit-btn::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 60%);
        pointer-events: none;
      }
      .exit-intent-submit-btn:hover {
        background: var(--gold-light);
        transform: translateY(-1px);
      }
      .exit-intent-submit-btn:active { transform: translateY(0); }

      .exit-intent-success-state {
        display: none;
        text-align: center;
        padding: 8px 0 4px;
      }
      .exit-intent-success-state.visible { display: block; }
      .exit-intent-success-check {
        font-size: 28px;
        margin-bottom: 10px;
      }
      .exit-intent-success-title {
        font-family: 'Playfair Display', serif;
        font-size: 22px;
        color: var(--gold-light);
        margin-bottom: 8px;
      }
      .exit-intent-success-sub {
        font-size: 13px;
        color: var(--text-muted);
        line-height: 1.6;
      }

      .exit-intent-social-proof {
        margin-top: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
      }
      .exit-intent-proof-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: 'Space Mono', monospace;
        font-size: 9.5px;
        letter-spacing: 0.08em;
        color: var(--text-muted);
        text-transform: uppercase;
      }
      .exit-intent-proof-dot {
        width: 3px;
        height: 3px;
        background: var(--gold);
        border-radius: 50%;
        opacity: 0.5;
      }

      .exit-intent-dismiss-link {
        display: block;
        text-align: center;
        margin-top: 16px;
        font-size: 11px;
        color: rgba(245, 237, 214, 0.2);
        cursor: pointer;
        letter-spacing: 0.05em;
        transition: color 0.2s;
        font-family: 'Space Mono', monospace;
      }
      .exit-intent-dismiss-link:hover { color: rgba(245, 237, 214, 0.45); }

      .exit-intent-scan-line {
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(201,168,76,0.15), transparent);
        animation: exitIntentScan 3.5s linear infinite;
        pointer-events: none;
      }
      @keyframes exitIntentScan {
        0% { top: 0; opacity: 0; }
        5% { opacity: 1; }
        95% { opacity: 1; }
        100% { top: 100%; opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  };

  const createPopup = () => {
    const html = `
      <div class="exit-intent-overlay" id="exit-intent-overlay">
        <div class="exit-intent-modal" role="dialog" aria-modal="true" aria-label="Subscribe to Called It newsletter">
          <div class="exit-intent-corner exit-intent-corner-tl"></div>
          <div class="exit-intent-corner exit-intent-corner-tr"></div>
          <div class="exit-intent-corner exit-intent-corner-bl"></div>
          <div class="exit-intent-corner exit-intent-corner-br"></div>

          <div class="exit-intent-scan-line"></div>

          <button class="exit-intent-close-btn" onclick="ExitIntentPopup.close()" aria-label="Close">
            <span>×</span> ESC
          </button>

          <div class="exit-intent-modal-inner">
            <svg class="exit-intent-eye-icon" viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="21" cy="21" rx="20" ry="12" stroke="#C9A84C" stroke-width="1.2" opacity="0.4"/>
              <circle cx="21" cy="21" r="7" fill="none" stroke="#C9A84C" stroke-width="1.2"/>
              <circle class="exit-intent-pupil" cx="21" cy="21" r="3.5" fill="#C9A84C" opacity="0.85"/>
              <circle cx="22.5" cy="19.5" r="1" fill="#F5EDD6" opacity="0.5"/>
              <line x1="1" y1="21" x2="5" y2="21" stroke="#C9A84C" stroke-width="1" opacity="0.4"/>
              <line x1="37" y1="21" x2="41" y2="21" stroke="#C9A84C" stroke-width="1" opacity="0.4"/>
            </svg>

            <p class="exit-intent-eyebrow-label">Called It. — The Newsletter</p>

            <h2 class="exit-intent-headline">
              The show called it.<br>
              <em>We kept receipts.</em>
            </h2>

            <p class="exit-intent-subtext">
              Every prediction Springfield Oracle verifies gets delivered to your inbox —
              <strong>with the episode, the evidence, and the gap year.</strong>
              No speculation. Just the ones that actually happened.
            </p>

            <div class="exit-intent-divider">
              <div class="exit-intent-divider-line"></div>
              <div class="exit-intent-divider-dot"></div>
              <div class="exit-intent-divider-line"></div>
            </div>

            <div id="exit-intent-form-container">
              <div class="exit-intent-form-row">
                <input
                  class="exit-intent-email-input"
                  type="email"
                  id="exit-intent-email-input"
                  placeholder="your@email.com"
                  autocomplete="email"
                  onkeydown="if(event.key==='Enter') ExitIntentPopup.submit()"
                  aria-label="Email address"
                />
                <button class="exit-intent-submit-btn" onclick="ExitIntentPopup.submit()">
                  Subscribe
                </button>
              </div>

              <div class="exit-intent-social-proof">
                <div class="exit-intent-proof-item"><span>Fact-checked</span></div>
                <div class="exit-intent-proof-dot"></div>
                <div class="exit-intent-proof-item"><span>Free forever</span></div>
                <div class="exit-intent-proof-dot"></div>
                <div class="exit-intent-proof-item"><span>No spam</span></div>
              </div>
            </div>

            <div class="exit-intent-success-state" id="exit-intent-success-state">
              <div class="exit-intent-success-check">◉</div>
              <p class="exit-intent-success-title">You're in the Oracle now.</p>
              <p class="exit-intent-success-sub">Check your inbox — the first issue is already waiting.<br>Springfield has been busy.</p>
            </div>

            <span class="exit-intent-dismiss-link" onclick="ExitIntentPopup.close()">
              I already know the future — dismiss
            </span>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  };

  const attachEventListeners = () => {
    const overlay = document.getElementById('exit-intent-overlay');
    if (!overlay) return;

    // Close on overlay click (outside modal)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Close on ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  };

  const attachExitIntent = () => {
    // Uncomment this section once you've tested the popup locally
    // document.addEventListener('mouseleave', (e) => {
    //   if (e.clientY < 10 && !exitTriggered && !sessionStorage.getItem('exit_intent_dismissed')) {
    //     exitTriggered = true;
    //     document.getElementById('exit-intent-overlay').style.display = 'flex';
    //   }
    // });
  };

  const submit = (onSubscribe) => {
    const emailInput = document.getElementById('exit-intent-email-input');
    const email = emailInput.value;

    if (!email || !email.includes('@')) {
      emailInput.style.borderColor = 'rgba(220, 80, 80, 0.5)';
      emailInput.focus();
      return;
    }

    // Call the onSubscribe callback or backend API
    if (onSubscribe) {
      onSubscribe(email);
    } else {
      // Default: call /api/subscribe endpoint
      fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      }).catch(err => console.error('Subscribe error:', err));
    }

    // Show success state
    document.getElementById('exit-intent-form-container').style.display = 'none';
    document.getElementById('exit-intent-success-state').classList.add('visible');

    // Auto-close after 3.5s
    setTimeout(() => close(), 3500);
  };

  const close = () => {
    const overlay = document.getElementById('exit-intent-overlay');
    if (!overlay) return;
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      overlay.style.display = 'none';
      sessionStorage.setItem('exit_intent_dismissed', '1');
    }, 300);
  };

  const init = (options = {}) => {
    // Don't show if already dismissed this session
    if (sessionStorage.getItem('exit_intent_dismissed')) return;

    createStyles();
    createPopup();
    attachEventListeners();
    if (options.enableExitIntent) {
      attachExitIntent();
    }

    // Expose methods globally for onclick handlers
    window.ExitIntentPopup = {
      submit: () => submit(options.onSubscribe),
      close,
      show: () => {
        const overlay = document.getElementById('exit-intent-overlay');
        if (overlay) overlay.style.display = 'flex';
      }
    };
  };

  return {
    init,
    submit: () => submit(),
    close,
    show: () => {
      const overlay = document.getElementById('exit-intent-overlay');
      if (overlay) overlay.style.display = 'flex';
    }
  };
})();
