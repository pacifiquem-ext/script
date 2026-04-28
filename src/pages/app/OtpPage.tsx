import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import './AuthPage.css';
import './OtpPage.css';

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
    text.split('').forEach((c, i) => { next[i] = c; });
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

  const isComplete = digits.every(d => d !== '');

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__logo">
          <Link to="/" className="auth-logo">
            <span className="auth-logo__mark" />
            <span className="auth-logo__text">Script</span>
          </Link>
        </div>

        <div className="auth-card__header">
          <h1 className="text-h5 auth-card__title">Check your email</h1>
          <p className="text-para-sm auth-card__sub">
            We sent a 6-digit code to your email address. Enter it below.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="otp-inputs" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                className={`otp-input${d ? ' otp-input--filled' : ''}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
              />
            ))}
          </div>

          <Button
            type="submit"
            size="md"
            loading={loading}
            disabled={!isComplete}
            className="auth-form__submit"
          >
            Verify code
          </Button>
        </form>

        <p className="text-para-sm auth-card__footer">
          Didn't receive it?{' '}
          {resent
            ? <span style={{ color: 'var(--primary-base)' }}>Code resent!</span>
            : <button className="auth-resend-btn" onClick={handleResend}>Resend code</button>
          }
        </p>
      </div>
    </div>
  );
}
