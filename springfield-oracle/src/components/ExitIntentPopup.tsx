/**
 * Exit Intent Popup — React Component
 *
 * Usage in your Next.js/React app:
 *   import ExitIntentPopup from '@/components/ExitIntentPopup';
 *
 *   export default function App() {
 *     return (
 *       <>
 *         <ExitIntentPopup
 *           onSubscribe={async (email) => {
 *             await fetch('/api/subscribe', {
 *               method: 'POST',
 *               body: JSON.stringify({ email })
 *             });
 *           }}
 *           enableExitIntent={true}
 *         />
 *         {/* rest of app */}
 *       </>
 *     );
 *   }
 */

'use client';

import React, { useState, useEffect } from 'react';

interface ExitIntentPopupProps {
  onSubscribe?: (email: string) => void | Promise<void>;
  enableExitIntent?: boolean;
}

export default function ExitIntentPopup({
  onSubscribe,
  enableExitIntent = false
}: ExitIntentPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [exitTriggered, setExitTriggered] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed this session
    const isDismissed = sessionStorage.getItem('exit_intent_dismissed');
    if (isDismissed) return;

    if (enableExitIntent) {
      const handleMouseLeave = (e: MouseEvent) => {
        if (
          e.clientY < 10 &&
          !exitTriggered &&
          !sessionStorage.getItem('exit_intent_dismissed')
        ) {
          setExitTriggered(true);
          setIsOpen(true);
        }
      };

      document.addEventListener('mouseleave', handleMouseLeave);
      return () => {
        document.removeEventListener('mouseleave', handleMouseLeave);
      };
    }
  }, [exitTriggered, enableExitIntent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      setEmailError(true);
      return;
    }

    setEmailError(false);

    try {
      if (onSubscribe) {
        await onSubscribe(email);
      } else {
        // Default: call /api/subscribe endpoint
        const response = await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        if (!response.ok) throw new Error('Subscribe failed');
      }

      setIsSuccess(true);
      setTimeout(() => {
        close();
      }, 3500);
    } catch (error) {
      console.error('Subscribe error:', error);
      setEmailError(true);
    }
  };

  const close = () => {
    setIsOpen(false);
    sessionStorage.setItem('exit_intent_dismissed', '1');
    setEmail('');
    setIsSuccess(false);
    setEmailError(false);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-1000 flex items-center justify-center bg-black/88 backdrop-blur-md p-5"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        {/* Noise texture */}
        <div
          className="fixed inset-0 pointer-events-none -z-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`,
            opacity: 0.04
          }}
        />

        {/* Modal Card */}
        <div
          className="relative w-full max-w-lg bg-[#1A1710] border border-[rgba(201,168,76,0.25)] overflow-hidden"
          style={{
            animation: 'slideUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.15s forwards'
          }}
        >
          {/* Top gold bar */}
          <div
            className="absolute top-0 left-0 right-0 h-0.5"
            style={{
              background:
                'linear-gradient(90deg, transparent, #C9A84C, #E8C97A, #C9A84C, transparent)'
            }}
          />

          {/* Corner ornaments */}
          <div className="absolute top-2 left-2 w-5 h-5 border-t border-l border-[#C9A84C] opacity-50" />
          <div className="absolute top-2 right-2 w-5 h-5 border-t border-r border-[#C9A84C] opacity-50" />
          <div className="absolute bottom-2 left-2 w-5 h-5 border-b border-l border-[#C9A84C] opacity-50" />
          <div className="absolute bottom-2 right-2 w-5 h-5 border-b border-r border-[#C9A84C] opacity-50" />

          {/* Scanning line */}
          <div
            className="absolute top-0 left-0 right-0 h-px pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.15), transparent)',
              animation: 'scan 3.5s linear infinite'
            }}
          />

          {/* Close button */}
          <button
            onClick={close}
            aria-label="Close"
            className="absolute top-4 right-4.5 bg-none border-none text-[rgba(245,237,214,0.45)] font-mono text-xs tracking-wider cursor-pointer flex items-center gap-1.5 transition-colors hover:text-[#F5EDD6]"
          >
            <span className="text-base leading-none">×</span> ESC
          </button>

          {/* Content */}
          <div className="p-12 pt-12 text-center">
            {/* Eye icon */}
            <svg
              className="w-10.5 h-10.5 mx-auto mb-5.5 opacity-90"
              viewBox="0 0 42 42"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <ellipse cx="21" cy="21" rx="20" ry="12" stroke="#C9A84C" strokeWidth="1.2" opacity="0.4" />
              <circle cx="21" cy="21" r="7" fill="none" stroke="#C9A84C" strokeWidth="1.2" />
              <circle
                cx="21"
                cy="21"
                r="3.5"
                fill="#C9A84C"
                opacity="0.85"
                style={{ animation: 'eyeMove 4s ease-in-out infinite' }}
              />
              <circle cx="22.5" cy="19.5" r="1" fill="#F5EDD6" opacity="0.5" />
              <line x1="1" y1="21" x2="5" y2="21" stroke="#C9A84C" strokeWidth="1" opacity="0.4" />
              <line x1="37" y1="21" x2="41" y2="21" stroke="#C9A84C" strokeWidth="1" opacity="0.4" />
            </svg>

            {/* Label */}
            <p className="font-mono text-xs tracking-widest text-[#C9A84C] uppercase mb-3.5">
              Called It. — The Newsletter
            </p>

            {/* Headline */}
            <h2 className="font-serif text-3xl font-black leading-tight text-[#F5EDD6] mb-3.5">
              The show called it.
              <br />
              <em className="italic text-[#E8C97A]">We kept receipts.</em>
            </h2>

            {/* Subtext */}
            <p className="text-sm leading-relaxed text-[rgba(245,237,214,0.45)] mb-7 font-light max-w-xs mx-auto">
              Every prediction Springfield Oracle verifies gets delivered to your inbox —
              <strong className="text-[rgba(245,237,214,0.75)] font-medium">
                {' '}
                with the episode, the evidence, and the gap year.
              </strong>
              {' '}
              No speculation. Just the ones that actually happened.
            </p>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-[rgba(201,168,76,0.25)]" />
              <div className="w-1 h-1 bg-[#C9A84C] rotate-45 opacity-60" />
              <div className="flex-1 h-px bg-[rgba(201,168,76,0.25)]" />
            </div>

            {!isSuccess ? (
              <>
                {/* Form */}
                <form onSubmit={handleSubmit} className="mb-3.5">
                  <div className="flex gap-2.5 mb-3.5">
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailError(false);
                      }}
                      aria-label="Email address"
                      className={`flex-1 bg-[rgba(255,255,255,0.04)] border text-[#F5EDD6] font-sans text-sm px-4 py-3.25 outline-none transition-all caret-[#C9A84C] placeholder:text-[rgba(245,237,214,0.25)] placeholder:italic focus:border-[rgba(201,168,76,0.6)] focus:bg-[rgba(255,255,255,0.06)] ${
                        emailError ? 'border-[rgba(220,80,80,0.5)]' : 'border-[rgba(201,168,76,0.2)]'
                      }`}
                    />
                    <button
                      type="submit"
                      className="bg-[#C9A84C] text-[#0A0804] border-none font-mono text-xs font-bold tracking-wider uppercase px-5.5 py-3.25 cursor-pointer whitespace-nowrap transition-all relative overflow-hidden hover:bg-[#E8C97A] hover:translate-y-[-1px] active:translate-y-0"
                      style={{
                        backgroundImage:
                          'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 60%)'
                      }}
                    >
                      Subscribe
                    </button>
                  </div>

                  {/* Social proof */}
                  <div className="flex items-center justify-center gap-4">
                    <span className="font-mono text-[9.5px] tracking-wider text-[rgba(245,237,214,0.45)] uppercase">
                      Fact-checked
                    </span>
                    <div className="w-0.75 h-0.75 bg-[#C9A84C] rounded-full opacity-50" />
                    <span className="font-mono text-[9.5px] tracking-wider text-[rgba(245,237,214,0.45)] uppercase">
                      Free forever
                    </span>
                    <div className="w-0.75 h-0.75 bg-[#C9A84C] rounded-full opacity-50" />
                    <span className="font-mono text-[9.5px] tracking-wider text-[rgba(245,237,214,0.45)] uppercase">
                      No spam
                    </span>
                  </div>
                </form>

                {/* Dismiss link */}
                <button
                  onClick={close}
                  className="block text-center mx-auto mt-4 text-xs text-[rgba(245,237,214,0.2)] cursor-pointer tracking-widest transition-colors hover:text-[rgba(245,237,214,0.45)] font-mono bg-none border-none"
                >
                  I already know the future — dismiss
                </button>
              </>
            ) : (
              <>
                {/* Success state */}
                <div className="text-center py-2">
                  <div className="text-2xl mb-2.5">◉</div>
                  <p className="font-serif text-xl text-[#E8C97A] mb-2">You're in the Oracle now.</p>
                  <p className="text-sm text-[rgba(245,237,214,0.45)] leading-relaxed">
                    Check your inbox — the first issue is already waiting.
                    <br />
                    Springfield has been busy.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes slideUp {
          to {
            transform: translateY(0) scale(1);
          }
        }
        @keyframes scan {
          0% {
            top: 0;
            opacity: 0;
          }
          5% {
            opacity: 1;
          }
          95% {
            opacity: 1;
          }
          100% {
            top: 100%;
            opacity: 0;
          }
        }
        @keyframes eyeMove {
          0%,
          100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(3px);
          }
          75% {
            transform: translateX(-3px);
          }
        }
      `}</style>
    </>
  );
}
