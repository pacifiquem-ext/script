import type { ReactNode } from 'react';
import { RedirectIfAuthenticated } from './RequireAuth';

export function GuestOnly({ children }: { children: ReactNode }) {
  return <RedirectIfAuthenticated>{children}</RedirectIfAuthenticated>;
}
