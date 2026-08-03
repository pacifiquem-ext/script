import { ConfigurationError } from '../../common/errors';
import { logger } from '../../lib/logger';

const FIREFLIES_GRAPHQL = 'https://api.fireflies.ai/graphql';

export type FirefliesSentence = {
  index: number;
  speaker_name: string | null;
  text: string;
  start_time: number | null;
  end_time: number | null;
};

export type FirefliesTranscript = {
  id: string;
  title: string | null;
  date: number | null;
  duration: number | null;
  transcript_url: string | null;
  participants: string[] | null;
  meeting_attendees: Array<{
    displayName?: string | null;
    name?: string | null;
    email?: string | null;
  }> | null;
  speakers: Array<{ id: string; name: string }> | null;
  sentences: FirefliesSentence[] | null;
  summary: {
    overview?: string | null;
    short_summary?: string | null;
    short_overview?: string | null;
    action_items?: string | null;
    bullet_gist?: string | null;
  } | null;
};

const TRANSCRIPT_FIELDS = `
  id
  title
  date
  duration
  transcript_url
  participants
  meeting_attendees { displayName name email }
  speakers { id name }
  sentences { index speaker_name text start_time end_time }
  summary {
    overview
    short_summary
    short_overview
    action_items
    bullet_gist
  }
`;

async function firefliesGraphql<T>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(FIREFLIES_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (!response.ok || body.errors?.length) {
    const msg = body.errors?.map((e) => e.message).join('; ') || `HTTP ${response.status}`;
    logger.warn({ status: response.status, msg }, 'fireflies graphql error');
    throw new ConfigurationError(`Fireflies API error: ${msg}`);
  }
  if (!body.data) throw new ConfigurationError('Fireflies API returned empty data');
  return body.data;
}

export async function fetchFirefliesTranscript(
  apiKey: string,
  transcriptId: string,
): Promise<FirefliesTranscript> {
  const data = await firefliesGraphql<{ transcript: FirefliesTranscript | null }>(
    apiKey,
    `query Transcript($transcriptId: String!) {
      transcript(id: $transcriptId) { ${TRANSCRIPT_FIELDS} }
    }`,
    { transcriptId },
  );
  if (!data.transcript) throw new ConfigurationError('Fireflies transcript not found');
  return data.transcript;
}

export async function listFirefliesTranscripts(
  apiKey: string,
  limit = 20,
): Promise<Array<{ id: string; title: string | null; date: number | null }>> {
  const data = await firefliesGraphql<{
    transcripts: Array<{ id: string; title: string | null; date: number | null }> | null;
  }>(
    apiKey,
    `query Transcripts($limit: Int) {
      transcripts(limit: $limit) { id title date }
    }`,
    { limit },
  );
  return data.transcripts ?? [];
}

export function buildTranscriptText(sentences: FirefliesSentence[]): string {
  return sentences
    .map((s) => {
      const speaker = s.speaker_name?.trim() || 'Speaker';
      const start =
        s.start_time != null && Number.isFinite(s.start_time)
          ? formatTs(s.start_time)
          : null;
      const prefix = start ? `[${start}] ${speaker}: ` : `${speaker}: `;
      return `${prefix}${s.text.trim()}`;
    })
    .filter((line) => line.length > 4)
    .join('\n');
}

function formatTs(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function secondsToMs(sec: number | null | undefined): number | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  return Math.round(sec * 1000);
}
