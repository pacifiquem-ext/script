import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { ApiClientError, apiRequest, getApiBaseUrl } from '../../lib/api-client';
import { getErrorMessage } from '../../lib/form-errors';
import { notify } from '../../components/ui/toast-alert';

type GithubStatus = {
  connected?: boolean;
  repos?: string[];
  lastSyncAt?: string | null;
};

type SlackBinding = {
  id: string;
  channelId: string;
  channelName: string | null;
  announcedAt?: string | null;
};

type SlackStatus = {
  connected: boolean;
  teamName: string | null;
  oauthConfigured?: boolean;
  bindings: SlackBinding[];
};

export function ConnectorsPage() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ghToken, setGhToken] = useState('');
  const [ghRepos, setGhRepos] = useState('');
  const [slackToken, setSlackToken] = useState('');
  const [slackTeamId, setSlackTeamId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [channelName, setChannelName] = useState('');
  const [ghDisconnectOpen, setGhDisconnectOpen] = useState(false);
  const [slackDisconnectOpen, setSlackDisconnectOpen] = useState(false);
  const [unbindId, setUnbindId] = useState<string | null>(null);

  const connectorsQ = useQuery({
    queryKey: ['connectors'],
    queryFn: async () => apiRequest<{ connectors: Array<Record<string, unknown>> }>('/connectors'),
  });
  const slackQ = useQuery({
    queryKey: ['slack-status'],
    queryFn: async () => apiRequest<SlackStatus>('/slack/status'),
  });

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['connectors'] });
    await qc.invalidateQueries({ queryKey: ['slack-status'] });
  };

  const ghConnect = useMutation({
    mutationFn: async () =>
      apiRequest('/connectors/github', {
        method: 'POST',
        body: {
          token: ghToken.trim(),
          repos: ghRepos
            .split(/[\n,]+/)
            .map((r) => r.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: async () => {
      setMsg('GitHub connected.');
      setGhToken('');
      await invalidate();
    },
    onError: (e) => setError(getErrorMessage(e, 'GitHub connect failed')),
  });

  const ghSync = useMutation({
    mutationFn: async () =>
      apiRequest<{ imported: number }>('/connectors/github/sync', { method: 'POST', body: {} }),
    onSuccess: async (r) => {
      setMsg(`GitHub sync: ${r.imported ?? 0} items.`);
      await invalidate();
    },
    onError: (e) => setError(getErrorMessage(e, 'GitHub sync failed')),
  });

  const ghDisconnect = useMutation({
    mutationFn: async () => apiRequest('/connectors/github', { method: 'DELETE' }),
    onSuccess: async () => {
      setGhDisconnectOpen(false);
      setMsg('GitHub disconnected. Work items and their memory were removed.');
      await invalidate();
    },
    onError: (e) => setError(getErrorMessage(e, 'GitHub disconnect failed')),
  });

  const slackInstall = useMutation({
    mutationFn: async () =>
      apiRequest('/slack/install', {
        method: 'POST',
        body: { botToken: slackToken.trim(), teamId: slackTeamId.trim() },
      }),
    onSuccess: async () => {
      setMsg('Slack bot installed.');
      setSlackToken('');
      await invalidate();
    },
    onError: (e) => setError(getErrorMessage(e, 'Slack install failed')),
  });

  const slackDisconnect = useMutation({
    mutationFn: async () => apiRequest('/slack/install', { method: 'DELETE' }),
    onSuccess: async () => {
      setSlackDisconnectOpen(false);
      setMsg('Slack disconnected.');
      await invalidate();
    },
    onError: (e) => setError(getErrorMessage(e, 'Slack disconnect failed')),
  });

  const bindChannel = useMutation({
    mutationFn: async () =>
      apiRequest('/slack/bindings', {
        method: 'POST',
        body: { channelId: channelId.trim(), channelName: channelName.trim() || undefined },
      }),
    onSuccess: async () => {
      setMsg('Channel bound.');
      setChannelId('');
      setChannelName('');
      await invalidate();
    },
    onError: (e) => setError(getErrorMessage(e, 'Bind failed')),
  });

  const unbindChannel = useMutation({
    mutationFn: async (bindingId: string) =>
      apiRequest(`/slack/bindings/${bindingId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setUnbindId(null);
      setMsg('Channel unbound.');
      await invalidate();
    },
    onError: (e) => setError(getErrorMessage(e, 'Unbind failed')),
  });

  const backfillChannel = useMutation({
    mutationFn: async (bindingId: string) =>
      apiRequest(`/slack/bindings/${bindingId}/backfill`, { method: 'POST', body: {} }),
    onSuccess: async () => {
      notify.success('Channel backfill started.');
      await invalidate();
    },
    onError: (e) => {
      if (e instanceof ApiClientError && (e.status === 404 || e.status === 501)) {
        notify.info('Channel backfill is not available on this install yet.');
        return;
      }
      notify.error(getErrorMessage(e, 'Backfill failed'));
    },
  });

  const gh = connectorsQ.data?.connectors?.[0] as GithubStatus | undefined;
  const slackOauthUrl = `${getApiBaseUrl()}/slack/oauth/start`;

  if (connectorsQ.isLoading || slackQ.isLoading) {
    return (
      <div className="h-full overflow-y-auto p-8 max-w-3xl">
        <h1 className="text-[20px] font-semibold text-neutral-950 mb-1">Connectors</h1>
        <LoadingState label="Loading connectors…" />
      </div>
    );
  }

  if (connectorsQ.isError || slackQ.isError) {
    return (
      <div className="h-full overflow-y-auto p-8 max-w-3xl">
        <h1 className="text-[20px] font-semibold text-neutral-950 mb-1">Connectors</h1>
        <p className="text-[13px] text-neutral-500 mb-6">
          System connectors (work + messaging) — distinct from file Integrations.
        </p>
        <ErrorState
          message={getErrorMessage(
            connectorsQ.error ?? slackQ.error,
            'Failed to load connectors',
          )}
          onRetry={() => {
            void connectorsQ.refetch();
            void slackQ.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-8 max-w-3xl">
      <h1 className="text-[20px] font-semibold text-neutral-950 mb-1">Connectors</h1>
      <p className="text-[13px] text-neutral-500 mb-6">
        System connectors (work + messaging) — distinct from file Integrations.
      </p>

      {error && (
        <Alert
          status="error"
          variant="stroke"
          compact
          description={error}
          onDismiss={() => setError(null)}
        />
      )}
      {msg && (
        <Alert
          status="success"
          variant="stroke"
          compact
          description={msg}
          onDismiss={() => setMsg(null)}
        />
      )}

      <section className="border border-neutral-200 rounded-20 p-5 mb-6 flex flex-col gap-3">
        <h2 className="text-[16px] font-semibold">GitHub (work system)</h2>
        <p className="text-[12px] text-neutral-500">
          Connect a PAT / fine-grained token and list repos as <code>owner/name</code>. Sync imports
          issues as work items; chat tools live-fetch assignee/state.
        </p>
        {gh?.connected ? (
          <>
            <p className="text-[13px] text-primary-base">Connected</p>
            <p className="text-[12px] text-neutral-500">
              Repos: {(gh.repos ?? []).join(', ') || '—'}
              {gh.lastSyncAt ? ` · last sync ${new Date(gh.lastSyncAt).toLocaleString()}` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                className="w-fit"
                loading={ghSync.isPending}
                onClick={() => {
                  setError(null);
                  ghSync.mutate();
                }}
              >
                Sync issues
              </Button>
              <Button
                variant="error"
                size="sm"
                className="w-fit"
                onClick={() => {
                  setError(null);
                  setGhDisconnectOpen(true);
                }}
              >
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <input
              type="password"
              className="h-9 px-3 border border-neutral-200 rounded-8 text-[13px]"
              placeholder="GitHub token"
              value={ghToken}
              onChange={(e) => setGhToken(e.target.value)}
            />
            <textarea
              className="min-h-[72px] px-3 py-2 border border-neutral-200 rounded-8 text-[13px]"
              placeholder="Repos (one per line): acme/api"
              value={ghRepos}
              onChange={(e) => setGhRepos(e.target.value)}
            />
            <Button
              variant="primary"
              size="sm"
              className="w-fit"
              loading={ghConnect.isPending}
              disabled={ghToken.trim().length < 20 || !ghRepos.trim()}
              onClick={() => {
                setError(null);
                ghConnect.mutate();
              }}
            >
              Connect GitHub
            </Button>
          </>
        )}
      </section>

      <section className="border border-neutral-200 rounded-20 p-5 flex flex-col gap-3">
        <h2 className="text-[16px] font-semibold">Slack (messaging)</h2>
        <p className="text-[12px] text-neutral-500">
          Install via OAuth or paste a bot token (xoxb-…), bind channels to listen, Events API
          webhook <code>/webhooks/slack/events</code> with <code>SLACK_SIGNING_SECRET</code>.
          Mentions ack with hourglass and reply in thread.
        </p>
        {slackQ.data?.connected ? (
          <>
            <p className="text-[13px] text-primary-base">
              Connected{slackQ.data.teamName ? ` · ${slackQ.data.teamName}` : ''}
            </p>
            <ul className="text-[12px] text-neutral-600 list-none p-0 m-0 flex flex-col gap-2">
              {(slackQ.data.bindings ?? []).map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 border border-neutral-100 rounded-12 px-3 py-2"
                >
                  <span className="flex flex-col">
                    <span>{b.channelName ? `#${b.channelName}` : b.channelId}</span>
                    <span className="text-[11px] text-neutral-400">
                      {b.announcedAt
                        ? `Announced ${new Date(b.announcedAt).toLocaleString()}`
                        : 'Not announced in-channel yet'}
                    </span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="neutral"
                      size="sm"
                      className="w-fit"
                      loading={backfillChannel.isPending && backfillChannel.variables === b.id}
                      onClick={() => {
                        setError(null);
                        backfillChannel.mutate(b.id);
                      }}
                    >
                      Backfill
                    </Button>
                    <Button
                      variant="error"
                      size="sm"
                      className="w-fit"
                      onClick={() => {
                        setError(null);
                        setUnbindId(b.id);
                      }}
                    >
                      Unbind
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 items-end">
              <input
                className="h-9 px-3 border border-neutral-200 rounded-8 text-[13px]"
                placeholder="Channel ID (C…)"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
              />
              <input
                className="h-9 px-3 border border-neutral-200 rounded-8 text-[13px]"
                placeholder="Name (optional)"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
              />
              <Button
                variant="primary"
                size="sm"
                className="w-fit"
                loading={bindChannel.isPending}
                disabled={!channelId.trim()}
                onClick={() => {
                  setError(null);
                  bindChannel.mutate();
                }}
              >
                Bind channel
              </Button>
              <Button
                variant="error"
                size="sm"
                className="w-fit"
                onClick={() => {
                  setError(null);
                  setSlackDisconnectOpen(true);
                }}
              >
                Disconnect Slack
              </Button>
            </div>
          </>
        ) : (
          <>
            {slackQ.data?.oauthConfigured ? (
              <Button
                variant="primary"
                size="sm"
                className="w-fit"
                type="button"
                onClick={() => {
                  window.location.assign(slackOauthUrl);
                }}
              >
                Add to Slack
              </Button>
            ) : null}
            <p className="text-[12px] text-neutral-500">
              {slackQ.data?.oauthConfigured
                ? 'Or paste a bot token if you cannot complete OAuth in this environment.'
                : 'OAuth is not configured on this install. Paste a bot token to connect.'}
            </p>
            <input
              type="password"
              className="h-9 px-3 border border-neutral-200 rounded-8 text-[13px]"
              placeholder="Bot token xoxb-…"
              value={slackToken}
              onChange={(e) => setSlackToken(e.target.value)}
            />
            <input
              className="h-9 px-3 border border-neutral-200 rounded-8 text-[13px]"
              placeholder="Slack team ID (T…)"
              value={slackTeamId}
              onChange={(e) => setSlackTeamId(e.target.value)}
            />
            <Button
              variant="neutral"
              size="sm"
              className="w-fit"
              loading={slackInstall.isPending}
              disabled={slackToken.trim().length < 20 || !slackTeamId.trim()}
              onClick={() => {
                setError(null);
                slackInstall.mutate();
              }}
            >
              Install Slack bot
            </Button>
          </>
        )}
      </section>

      <ConfirmModal
        open={ghDisconnectOpen}
        onOpenChange={setGhDisconnectOpen}
        title="Disconnect GitHub?"
        description="This removes the connector, imported work items, and their memory chunks for this workspace."
        confirmLabel="Disconnect"
        destructive
        loading={ghDisconnect.isPending}
        onConfirm={() => ghDisconnect.mutate()}
      />
      <ConfirmModal
        open={slackDisconnectOpen}
        onOpenChange={setSlackDisconnectOpen}
        title="Disconnect Slack?"
        description="This uninstalls the Slack bot, unbinds every channel, and deletes channel memory chunks for this workspace."
        confirmLabel="Disconnect"
        destructive
        loading={slackDisconnect.isPending}
        onConfirm={() => slackDisconnect.mutate()}
      />
      <ConfirmModal
        open={Boolean(unbindId)}
        onOpenChange={(next) => {
          if (!next) setUnbindId(null);
        }}
        title="Unbind this channel?"
        description="script will stop ingesting new messages from this Slack channel and delete existing channel memory chunks for it."
        confirmLabel="Unbind"
        destructive
        loading={unbindChannel.isPending}
        onConfirm={() => {
          if (unbindId) unbindChannel.mutate(unbindId);
        }}
      />
    </div>
  );
}
