import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconMail, IconLockPassword, IconEye, IconEyeOff } from '../../lib/icons';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

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
    setTimeout(() => {
      setLoading(false);
      navigate('/app/signup-success');
    }, 800);
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
          <h1 className="text-h5 text-neutral-950">Create an account</h1>
          <p className="text-para-sm text-neutral-600">Start organizing your documents today</p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Input
            label="Full name"
            type="text"
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="Email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<IconMail size={18} />}
            required
          />
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<IconLockPassword size={18} />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="bg-transparent border-none cursor-pointer text-neutral-400 flex items-center p-0 transition-colors hover:text-neutral-600"
                aria-label="Toggle password"
              >
                {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            }
            hint="Must be at least 8 characters."
            required
          />

          <Button
            type="submit"
            size="md"
            loading={loading}
            className="self-center min-w-[200px] mt-2"
          >
            Create account
          </Button>

          <p className="text-para-xs text-neutral-400 text-center mt-2">
            By signing up, you agree to our{' '}
            <a
              href="/terms"
              className="text-neutral-600 underline underline-offset-2 transition-colors hover:text-neutral-950"
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="/privacy"
              className="text-neutral-600 underline underline-offset-2 transition-colors hover:text-neutral-950"
            >
              Privacy Policy
            </a>
            .
          </p>
        </form>

        <p className="text-para-sm text-neutral-600 text-center">
          Already have an account?{' '}
          <Link
            to="/app/login"
            className="text-primary-base font-medium no-underline transition-colors hover:text-primary-darker"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
