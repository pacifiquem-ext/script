import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/useAuth';
import { apiRequest } from '../../lib/api-client';
import { getErrorMessage } from '../../lib/form-errors';

export function InviteAcceptPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<{
    email: string;
    workspaceName: string;
    status: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing invite token');
      return;
    }
    void apiRequest<{ email: string; workspaceName: string; status: string }>(
      `/invites/preview?token=${encodeURIComponent(token)}`,
    )
      .then(setPreview)
      .catch((err) => setError(getErrorMessage(err, 'Invite not found')));
  }, [token]);

  const accept = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiRequest('/invites/accept', { method: 'POST', body: { token } });
      await refresh();
      navigate('/app/library');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not accept invite'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
      <div className="w-full max-w-[420px] flex flex-col gap-4">
        <h1 className="text-h5 text-neutral-950">Workspace invite</h1>
        {preview && (
          <p className="text-para-sm text-neutral-600">
            You&rsquo;re invited to <strong>{preview.workspaceName}</strong> as {preview.email}.
            Status: {preview.status}.
          </p>
        )}
        {error && (
          <Alert status="error" variant="stroke" compact description={error} onDismiss={() => setError(null)} />
        )}
        {!user ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-neutral-500">
              Sign in with the invited email, then return to this link.
            </p>
            <Link to="/app/login" className="text-primary-base text-[14px] font-medium no-underline">
              Sign in
            </Link>
            <Link to="/app/signup" className="text-primary-base text-[14px] font-medium no-underline">
              Create account
            </Link>
          </div>
        ) : (
          <Button
            variant="primary"
            size="md"
            className="w-fit"
            loading={loading}
            disabled={!token || preview?.status !== 'pending'}
            onClick={() => void accept()}
          >
            Accept invite
          </Button>
        )}
      </div>
    </div>
  );
}
