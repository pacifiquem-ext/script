import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconLockPassword, IconEye, IconEyeOff } from '../../lib/icons';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import './AuthPage.css';

export function ResetPasswordPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      navigate('/app/reset-success');
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
          <h1 className="text-h5 auth-card__title">Set new password</h1>
          <p className="text-para-sm auth-card__sub">Choose a strong password for your account.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <Input
            label="New password"
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
          />
          <Input
            label="Confirm password"
            type={showConfirm ? 'text' : 'password'}
            placeholder="Repeat your password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            leftIcon={<IconLockPassword size={18} />}
            rightIcon={
              <button type="button" onClick={() => setShowConfirm(v => !v)} className="auth-form__eye" aria-label="Toggle confirm">
                {showConfirm ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            }
          />

          <Button type="submit" size="md" loading={loading} className="auth-form__submit">
            Reset password
          </Button>
        </form>
      </div>
    </div>
  );
}
