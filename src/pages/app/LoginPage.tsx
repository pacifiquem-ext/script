import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconMail, IconLockPassword, IconEye, IconEyeOff } from '../../lib/icons';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import './AuthPage.css';

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); navigate('/app/chat'); }, 800);
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
          <h1 className="text-h5 auth-card__title">Welcome back</h1>
          <p className="text-para-sm auth-card__sub">Sign in to your workspace</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <Input
            label="Email"
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
            placeholder="Enter your password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            leftIcon={<IconLockPassword size={18} />}
            rightIcon={
              <button type="button" onClick={() => setShowPassword(v => !v)} className="auth-form__eye" aria-label="Toggle password">
                {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            }
            required
          />

          <div className="auth-form__row">
            <label className="auth-form__remember text-para-sm">
              <input type="checkbox" />
              <span>Remember me</span>
            </label>
            <Link to="/app/forgot-password" className="text-label-sm auth-form__forgot">Forgot password?</Link>
          </div>

          <Button type="submit" size="md" loading={loading} className="auth-form__submit">
            Sign in
          </Button>
        </form>

        <p className="text-para-sm auth-card__footer">
          Don&rsquo;t have an account?{' '}
          <Link to="/app/signup" className="auth-card__footer-link">Sign up free</Link>
        </p>
      </div>
    </div>
  );
}
