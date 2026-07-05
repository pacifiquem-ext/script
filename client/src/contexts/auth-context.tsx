import { createContext, useCallback, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, type PublicUser } from '@script/shared';
import { apiRequest } from '../lib/api-client';
import { queryKeys } from '../lib/query-client';

interface SessionResponse {
  user: PublicUser;
}

export interface AuthContextValue {
  user: PublicUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

async function fetchSession(): Promise<PublicUser | null> {
  try {
    const data = await apiRequest<SessionResponse>('/auth/me');
    return data.user;
  } catch (error: unknown) {
    if (isApiClientError(error) && (error.status === 401 || error.status === 404)) {
      return null;
    }
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: queryKeys.session,
    queryFn: fetchSession,
    staleTime: 60_000,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.session });
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await apiRequest<void>('/auth/logout', { method: 'POST', parseJson: false });
    } catch (error: unknown) {
      if (!(isApiClientError(error) && error.status === 404)) {
        throw error;
      }
    } finally {
      queryClient.setQueryData(queryKeys.session, null);
      await queryClient.invalidateQueries();
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: sessionQuery.data ?? null,
      isLoading: sessionQuery.isLoading,
      isAuthenticated: Boolean(sessionQuery.data),
      refresh,
      logout,
    }),
    [sessionQuery.data, sessionQuery.isLoading, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
