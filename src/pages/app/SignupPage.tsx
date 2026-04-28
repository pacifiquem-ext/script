import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconMail, IconLockPassword, IconUser, IconEye, IconEyeOff } from '../../lib/icons';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import './AuthPage.css';

export function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); navigate('/app/verify-otp?mode=signup'); }, 800);
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
          <h1 className="text-h5 auth-card__title">Create your account</h1>
          <p className="text-para-sm auth-card__sub">Start working with your documents today</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <Input
            label="Full name"
            type="text"
            placeholder="Jane Smith"
            value={name}
            onChange={e => setName(e.target.value)}
            leftIcon={<IconUser size={18} />}
            required
          />
          <Input
            label="Work email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            leftIcon={<IconMail size={18} />}
            required
          />
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="At least 8 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            leftIcon={<IconLockPassword size={18} />}
            rightIcon={
              <button type="button" onClick={() => setShowPassword(v => !v)} className="auth-form__eye" aria-label="Toggle password">
                {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            }
            hint="Must be at least 8 characters"
            required
          />

          <Button type="submit" size="md" loading={loading} className="auth-form__submit">
            Create account
          </Button>

          <p className="text-para-xs auth-form__terms">
            By creating an account you agree to our{' '}
            <Link to="/terms" className="auth-form__link">Terms of Service</Link> and{' '}
            <Link to="/privacy" className="auth-form__link">Privacy Policy</Link>.
          </p>
        </form>

        <p className="text-para-sm auth-card__footer">
          Already have an account?{' '}
          <Link to="/app/login" className="auth-card__footer-link">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
