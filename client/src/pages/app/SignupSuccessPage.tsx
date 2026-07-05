import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';

export function SignupSuccessPage() {
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

        <div className="flex items-center justify-center w-[60px] h-[60px] rounded-full bg-primary-alpha-10 text-primary-base mx-auto">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>

        <div className="text-center flex flex-col gap-1">
          <h1 className="text-h5 text-neutral-950">Account created!</h1>
          <p className="text-para-sm text-neutral-600">
            Welcome to Script. Your workspace is ready to go.
          </p>
        </div>

        <div className="flex justify-center">
          <Link to="/app/login" className="no-underline">
            <Button size="md" className="min-w-[200px]">
              Go to sign in
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
