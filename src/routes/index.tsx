import { createBrowserRouter, Navigate } from 'react-router-dom';

import { LandingLayout } from '../components/layout/LandingLayout';
import { AppLayout } from '../components/layout/AppLayout';
import { LandingPage } from '../pages/landing/LandingPage';
import { LoginPage } from '../pages/app/LoginPage';
import { SignupPage } from '../pages/app/SignupPage';
import { ForgotPasswordPage } from '../pages/app/ForgotPasswordPage';
import { OtpPage } from '../pages/app/OtpPage';
import { ResetPasswordPage } from '../pages/app/ResetPasswordPage';
import { ResetSuccessPage } from '../pages/app/ResetSuccessPage';
import { SignupSuccessPage } from '../pages/app/SignupSuccessPage';
import { ChatPage } from '../pages/app/ChatPage';
import { LibraryPage } from '../pages/app/LibraryPage';

export const router = createBrowserRouter([
  {
    element: <LandingLayout />,
    children: [
      { path: '/', element: <LandingPage /> },
    ],
  },
  { path: '/app/login',           element: <LoginPage /> },
  { path: '/app/signup',          element: <SignupPage /> },
  { path: '/app/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/app/verify-otp',      element: <OtpPage /> },
  { path: '/app/reset-password',  element: <ResetPasswordPage /> },
  { path: '/app/reset-success',   element: <ResetSuccessPage /> },
  { path: '/app/signup-success',  element: <SignupSuccessPage /> },
  {
    path: '/app',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/app/library" replace /> },
      { path: 'chat',    element: <ChatPage /> },
      { path: 'library', element: <LibraryPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
