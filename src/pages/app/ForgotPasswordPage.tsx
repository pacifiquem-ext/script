import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconMail } from '../../lib/icons';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import './AuthPage.css';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      navigate('/app/verify-otp?mode=reset');
    }, 800);
  };

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
          <h1 className="text-h5 auth-card__title">Forgot your password?</h1>
          <p className="text-para-sm auth-card__sub">
            Enter your email and we'll send you a code to reset it.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <Input
            label="Email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            leftIcon={<IconMail size={18} />}
          />

          <Button type="submit" size="md" loading={loading} className="auth-form__submit">
            Send reset code
          </Button>
        </form>

        <p className="text-para-sm auth-card__footer">
          <Link to="/app/login" className="auth-card__footer-link">← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
