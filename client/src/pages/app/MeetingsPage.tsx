import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicMeeting, PublicMeetingDetail } from '@script/shared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingState } from '../../components/ui/LoadingState';
import { apiRequest } from '../../lib/api-client';
import { getErrorMessage } from '../../lib/form-errors';

type ConnectorStatus = {
  provider: string;
  connected: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  webhookConfigured: boolean;
};

export function MeetingsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [highlightMs, setHighlightMs] = useState<number | null>(null);

  const listQuery = useQuery({
    queryKey: ['meetings'],
    queryFn: async () => {
      const data = await apiRequest<{ data: PublicMeeting[] }>('/meetings?pageSize=50');
      return data.data ?? [];
    },
  });

  const connectorQuery = useQuery({
    queryKey: ['meetings-connector-fireflies'],
    queryFn: async () => apiRequest<ConnectorStatus>('/meetings/connector/fireflies'),
  });

  const detailQuery = useQuery({
    queryKey: ['meetings', selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const data = await apiRequest<{ meeting: PublicMeetingDetail }>(`/meetings/${selectedId}`);
      return data.meeting;
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['meetings'] });
    await queryClient.invalidateQueries({ queryKey: ['meetings-connector-fireflies'] });
    if (selectedId) await queryClient.invalidateQueries({ queryKey: ['meetings', selectedId] });
  };

  const connectMutation = useMutation({
    mutationFn: async () =>
      apiRequest('/meetings/connector/fireflies', {
        method: 'POST',
        body: { apiKey: apiKey.trim() },
      }),
    onSuccess: async () => {
      setConnectOpen(false);
      setApiKey('');
      setMessage('Fireflies connected.');
      await invalidate();
    },
    onError: (err) => setError(getErrorMessage(err, 'Connect failed')),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => apiRequest('/meetings/connector/fireflies', { method: 'DELETE' }),
    onSuccess: async () => {
      setMessage('Fireflies disconnected.');
      await invalidate();
    },
    onError: (err) => setError(getErrorMessage(err, 'Disconnect failed')),
  });

  const syncMutation = useMutation({
    mutationFn: async () =>
      apiRequest<{ imported: number; skipped: number; failed: number }>(
        '/meetings/connector/fireflies/sync',
        { method: 'POST', body: { limit: 20 } },
      ),
    onSuccess: async (res) => {
      setMessage(
        `Sync complete: ${res.imported} imported, ${res.skipped} already ready, ${res.failed} failed.`,
      );
      await invalidate();
    },
    onError: (err) => setError(getErrorMessage(err, 'Sync failed')),
  });

  const meetings = listQuery.data ?? [];
  const detail = detailQuery.data;
  const connector = connectorQuery.data;

  return (
    <div className="flex h-full min-h-0 w-full bg-white">
      <aside className="w-[320px] shrink-0 border-r border-neutral-200 flex flex-col">
        <div className="p-4 flex flex-col gap-3 border-b border-neutral-100">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-[16px] font-semibold text-neutral-950">Meetings</h1>
          </div>
          <p className="text-[12px] text-neutral-500">
            Fireflies.ai (ADR 0013). Connect an API key, then sync transcripts into company memory.
          </p>
          {connector?.connected ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-primary-base font-medium">Fireflies connected</p>
              {connector.lastSyncAt && (
                <p className="text-[11px] text-neutral-500">
                  Last sync {new Date(connector.lastSyncAt).toLocaleString()}
                </p>
              )}
              {connector.lastError && (
                <p className="text-[11px] text-red-600">{connector.lastError}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  className="w-fit"
                  loading={syncMutation.isPending}
                  onClick={() => {
                    setError(null);
                    setMessage(null);
                    syncMutation.mutate();
                  }}
                >
                  Sync now
                </Button>
                <Button
                  variant="neutral"
                  size="sm"
                  className="w-fit"
                  loading={disconnectMutation.isPending}
                  onClick={() => {
                    setError(null);
                    disconnectMutation.mutate();
                  }}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              size="sm"
              className="w-fit"
              onClick={() => {
                setError(null);
                setConnectOpen(true);
              }}
            >
              Connect Fireflies
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {listQuery.isLoading && <LoadingState />}
          {!listQuery.isLoading && meetings.length === 0 && (
            <EmptyState
              title="No meetings yet"
              description="Connect Fireflies and run Sync to import call transcripts."
            />
          )}
          {meetings.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setSelectedId(m.id);
                setHighlightMs(null);
              }}
              className={`w-full text-left rounded-10 px-3 py-2 mb-1 border-none cursor-pointer transition-colors ${
                selectedId === m.id ? 'bg-primary-alpha-10' : 'bg-transparent hover:bg-neutral-50'
              }`}
            >
              <p className="text-[13px] font-medium text-neutral-950 truncate">{m.title}</p>
              <p className="text-[11px] text-neutral-500 capitalize">
                {m.status}
                {m.startedAt ? ` · ${new Date(m.startedAt).toLocaleDateString()}` : ''}
                {m.sourceProvider ? ` · ${m.sourceProvider}` : ''}
              </p>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto p-6">
        {(error || message) && (
          <div className="mb-4 max-w-3xl">
            {error && (
              <Alert
                status="error"
                variant="stroke"
                compact
                description={error}
                onDismiss={() => setError(null)}
              />
            )}
            {message && (
              <Alert
                status="success"
                variant="stroke"
                compact
                description={message}
                onDismiss={() => setMessage(null)}
              />
            )}
          </div>
        )}

        {!selectedId && (
          <EmptyState
            title="Select a meeting"
            description="Ask in Chat: what meetings do we have? or what did we decide on the client call?"
          />
        )}
        {selectedId && detailQuery.isLoading && <LoadingState />}
        {selectedId && detail && (
          <div className="max-w-3xl flex flex-col gap-5">
            <div>
              <h2 className="text-[20px] font-semibold text-neutral-950">{detail.title}</h2>
              <p className="text-[13px] text-neutral-500 capitalize">
                {detail.status}
                {detail.sourceProvider ? ` · ${detail.sourceProvider}` : ''}
                {detail.sourceUrl ? (
                  <>
                    {' · '}
                    <a
                      href={detail.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary-base no-underline"
                    >
                      Open in Fireflies
                    </a>
                  </>
                ) : null}
              </p>
            </div>
            {detail.summary && (
              <section>
                <h3 className="text-[13px] font-semibold text-neutral-800 mb-1">Summary</h3>
                <p className="text-[14px] text-neutral-700 whitespace-pre-wrap">{detail.summary}</p>
              </section>
            )}
            {detail.participants?.length > 0 && (
              <section>
                <h3 className="text-[13px] font-semibold text-neutral-800 mb-1">Participants</h3>
                <p className="text-[13px] text-neutral-600">
                  {detail.participants.map((p) => p.name).join(', ')}
                </p>
              </section>
            )}
            {detail.commitments?.length > 0 && (
              <section>
                <h3 className="text-[13px] font-semibold text-neutral-800 mb-1">
                  Decisions & action items
                </h3>
                <ul className="list-disc pl-5 text-[13px] text-neutral-700 space-y-1">
                  {detail.commitments.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="text-left bg-transparent border-none cursor-pointer p-0 text-[13px] text-neutral-700 hover:text-primary-base"
                        onClick={() => {
                          if (c.sourceStartMs != null) setHighlightMs(c.sourceStartMs);
                        }}
                      >
                        {c.text}
                        {c.ownerLabel ? ` — ${c.ownerLabel}` : ''}
                        {c.sourceStartMs != null ? ` (${Math.floor(c.sourceStartMs / 1000)}s)` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {detail.transcriptText && (
              <section>
                <h3 className="text-[13px] font-semibold text-neutral-800 mb-1">
                  Transcript
                  {highlightMs != null ? (
                    <span className="font-normal text-neutral-400">
                      {' '}
                      · jump ~{Math.floor(highlightMs / 1000)}s
                    </span>
                  ) : null}
                </h3>
                <pre
                  className="text-[12px] text-neutral-700 whitespace-pre-wrap bg-neutral-50 border border-neutral-200 rounded-12 p-4 max-h-[50vh] overflow-y-auto"
                  data-highlight-ms={highlightMs ?? undefined}
                >
                  {detail.transcriptText}
                </pre>
              </section>
            )}
          </div>
        )}
      </main>

      {connectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-white rounded-20 p-6 flex flex-col gap-3 shadow-lg">
            <h2 className="text-[16px] font-semibold">Connect Fireflies</h2>
            <p className="text-[12px] text-neutral-500">
              Create an API key in Fireflies → Integrations → Fireflies API. The key is encrypted at
              rest. Optional: set <code>FIREFLIES_WEBHOOK_SECRET</code> and point Fireflies webhooks
              at <code>/webhooks/fireflies</code> with clientReferenceId{' '}
              <code>ws:&lt;workspaceId&gt;</code>.
            </p>
            <input
              type="password"
              className="h-9 px-3 border border-neutral-200 rounded-8 text-[13px]"
              placeholder="Fireflies API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="neutral"
                size="sm"
                className="w-fit"
                onClick={() => setConnectOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="w-fit"
                loading={connectMutation.isPending}
                disabled={apiKey.trim().length < 16}
                onClick={() => {
                  setError(null);
                  connectMutation.mutate();
                }}
              >
                Connect
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
