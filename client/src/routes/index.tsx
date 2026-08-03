import { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { GuestOnly } from '../components/auth/GuestOnly';
import { RequireAuth } from '../components/auth/RequireAuth';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingState } from '../components/ui/LoadingState';
import { LandingPage } from '../pages/landing/page';

const LoginPage = lazy(() =>
  import('../pages/app/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const SignupPage = lazy(() =>
  import('../pages/app/SignupPage').then((m) => ({ default: m.SignupPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('../pages/app/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const OtpPage = lazy(() => import('../pages/app/OtpPage').then((m) => ({ default: m.OtpPage })));
const ResetPasswordPage = lazy(() =>
  import('../pages/app/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const ResetSuccessPage = lazy(() =>
  import('../pages/app/ResetSuccessPage').then((m) => ({ default: m.ResetSuccessPage })),
);
const SignupSuccessPage = lazy(() =>
  import('../pages/app/SignupSuccessPage').then((m) => ({ default: m.SignupSuccessPage })),
);
const ChatPage = lazy(() => import('../pages/app/ChatPage').then((m) => ({ default: m.ChatPage })));
const LibraryPage = lazy(() =>
  import('../pages/app/LibraryPage').then((m) => ({ default: m.LibraryPage })),
);
const InviteAcceptPage = lazy(() =>
  import('../pages/app/InviteAcceptPage').then((m) => ({ default: m.InviteAcceptPage })),
);

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/invite/accept',
    element: (
      <Lazy>
        <InviteAcceptPage />
      </Lazy>
    ),
  },
  {
    path: '/app/login',
    element: (
      <GuestOnly>
        <Lazy>
          <LoginPage />
        </Lazy>
      </GuestOnly>
    ),
  },
  {
    path: '/app/signup',
    element: (
      <GuestOnly>
        <Lazy>
          <SignupPage />
        </Lazy>
      </GuestOnly>
    ),
  },
  {
    path: '/app/forgot-password',
    element: (
      <GuestOnly>
        <Lazy>
          <ForgotPasswordPage />
        </Lazy>
      </GuestOnly>
    ),
  },
  {
    path: '/app/verify-otp',
    element: (
      <GuestOnly>
        <Lazy>
          <OtpPage />
        </Lazy>
      </GuestOnly>
    ),
  },
  {
    path: '/app/reset-password',
    element: (
      <GuestOnly>
        <Lazy>
          <ResetPasswordPage />
        </Lazy>
      </GuestOnly>
    ),
  },
  {
    path: '/app/reset-success',
    element: (
      <Lazy>
        <ResetSuccessPage />
      </Lazy>
    ),
  },
  {
    path: '/app/signup-success',
    element: (
      <Lazy>
        <SignupSuccessPage />
      </Lazy>
    ),
  },
  {
    path: '/app',
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/app/chat" replace /> },
          {
            path: 'chat',
            element: (
              <Lazy>
                <ChatPage />
              </Lazy>
            ),
          },
          {
            path: 'library',
            element: (
              <Lazy>
                <LibraryPage />
              </Lazy>
            ),
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
