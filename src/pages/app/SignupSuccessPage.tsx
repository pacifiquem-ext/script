import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import './AuthPage.css';
import './SuccessPage.css';

export function SignupSuccessPage() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__logo">
          <Link to="/" className="auth-logo">
            <span className="auth-logo__mark" />
            <span className="auth-logo__text">Script</span>
          </Link>
        </div>

        <div className="success-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>

        <div className="auth-card__header">
          <h1 className="text-h5 auth-card__title">Account created!</h1>
          <p className="text-para-sm auth-card__sub">
            Welcome to Script. Your workspace is ready to go.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Link to="/app/login">
            <Button size="md" className="auth-form__submit">
              Go to sign in
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
