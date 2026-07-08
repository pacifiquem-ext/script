import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { requestPasswordResetBodySchema } from '@script/shared';
import { IconMail } from '../../lib/icons';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { apiRequest } from '../../lib/api-client';
import { getErrorMessage } from '../../lib/form-errors';
import { Alert } from '../../components/ui/Alert';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body = requestPasswordResetBodySchema.parse({ email });
      await apiRequest('/auth/forgot-password', { method: 'POST', body });
      navigate('/app/verify-otp', { state: { email: body.email, purpose: 'password_reset' } });
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to send reset code'));
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-h5 text-neutral-950">Reset password</h1>
          <p className="text-para-sm text-neutral-600">
            Enter your email and we&apos;ll send you a code.
          </p>
        </div>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Input
            label="Email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<IconMail size={18} />}
            required
          />
          {error && (
            <Alert
              status="error"
              variant="stroke"
              compact
              description={error}
              onDismiss={() => setError(null)}
            />
          )}
          <Button
            type="submit"
            size="md"
            loading={loading}
            className="self-center min-w-[200px] mt-2"
          >
            Send code
          </Button>
        </form>
        <p className="text-para-sm text-neutral-600 text-center">
          Remembered it?{' '}
          <Link
            to="/app/login"
            className="text-primary-base font-medium no-underline transition-colors hover:text-primary-darker"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
