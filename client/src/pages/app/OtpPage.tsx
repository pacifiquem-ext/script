import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';

const OTP_LENGTH = 6;

export function OtpPage() {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = params.get('mode'); // 'reset' | 'signup'

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (i: number, val: string) => {
    const char = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = char;
    setDigits(next);
    if (char && i < OTP_LENGTH - 1) {
      inputRefs.current[i + 1]?.focus();
    }
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!text) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill('');
    text.split('').forEach((c, i) => {
      next[i] = c;
    });
    setDigits(next);
    inputRefs.current[Math.min(text.length, OTP_LENGTH - 1)]?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (mode === 'reset') {
        navigate('/app/reset-password');
      } else {
        navigate('/app/signup-success');
      }
    }, 800);
  };

  const handleResend = () => {
    setResent(true);
    setTimeout(() => setResent(false), 3000);
  };

  const isComplete = digits.every((d) => d !== '');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-[24px_16px] bg-white relative overflow-hidden">
      <div
        className="absolute inset-0 bg-[linear-gradient(to_right,theme(colors.neutral.200)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.neutral.200)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none z-0"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_0%,transparent_0%,theme(colors.neutral.0)_75%)] pointer-events-none z-10"
        aria-hidden
      />

      <div className="w-full max-w-[400px] p-8 flex flex-col gap-6 relative z-20">
        <div className="flex justify-center">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <span className="w-8 h-8 bg-primary-gradient rounded-8 relative shrink-0 after:absolute after:inset-[6px] after:border-2 after:border-white after:rounded-[3px] after:border-b-0 after:border-r-0" />
            <span className="text-[20px] font-semibold text-neutral-950 tracking-[-0.02em]">
              Script
            </span>
          </Link>
        </div>

        <div className="text-center flex flex-col gap-1">
          <h1 className="text-h5 text-neutral-950">Check your email</h1>
          <p className="text-para-sm text-neutral-600">
            We sent a 6-digit code to your email address. Enter it below.
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex gap-2 justify-center" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                className={`w-12 h-[52px] text-center text-[22px] font-semibold font-sans text-neutral-950 bg-white border-[1.5px] rounded-10 outline-none transition-all duration-200 caret-primary-base focus:border-primary-base focus:shadow-[0_0_0_3px_theme(colors.primary.alpha-16)] ${d ? 'border-neutral-300' : 'border-neutral-200'}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
              />
            ))}
          </div>

          <Button
            type="submit"
            size="md"
            loading={loading}
            disabled={!isComplete}
            className="self-center min-w-[200px] mt-2"
          >
            Verify code
          </Button>
        </form>

        <p className="text-para-sm text-neutral-600 text-center">
          Didn't receive it?{' '}
          {resent ? (
            <span className="text-primary-base">Code resent!</span>
          ) : (
            <button
              className="bg-transparent border-none cursor-pointer font-sans text-para-sm text-primary-base font-medium p-0 transition-colors hover:text-primary-darker"
              onClick={handleResend}
            >
              Resend code
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
