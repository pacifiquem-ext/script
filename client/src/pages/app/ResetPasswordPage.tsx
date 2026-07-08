import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { resetPasswordBodySchema } from '@script/shared';
import { IconLockPassword, IconEye, IconEyeOff } from '../../lib/icons';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { apiRequest } from '../../lib/api-client';
import { getErrorMessage } from '../../lib/form-errors';
import { useAuth } from '../../contexts/useAuth';
import { Alert } from '../../components/ui/Alert';

type LocationState = { email?: string; code?: string };

export function ResetPasswordPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const state = (location.state as LocationState | null) ?? {};

  useEffect(() => {
    if (!state.email || !state.code) navigate('/app/forgot-password', { replace: true });
  }, [navigate, state.code, state.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const body = resetPasswordBodySchema.parse({
        email: state.email,
        code: state.code,
        password,
      });
      await apiRequest('/auth/reset-password', { method: 'POST', body });
      await refresh();
      navigate('/app/reset-success');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to reset password'));
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
          <h1 className="text-h5 text-neutral-950">Set new password</h1>
          <p className="text-para-sm text-neutral-600">
            Choose a strong password for your account.
          </p>
        </div>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Input
            label="New password"
            type={showPassword ? 'text' : 'password'}
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<IconLockPassword size={18} />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="bg-transparent border-none cursor-pointer text-neutral-400 flex items-center p-0"
                aria-label="Toggle password"
              >
                {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            }
            required
          />
          <Input
            label="Confirm password"
            type={showConfirm ? 'text' : 'password'}
            placeholder="Repeat your password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            leftIcon={<IconLockPassword size={18} />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="bg-transparent border-none cursor-pointer text-neutral-400 flex items-center p-0"
                aria-label="Toggle confirm"
              >
                {showConfirm ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            }
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
            Reset password
          </Button>
        </form>
      </div>
    </div>
  );
}
