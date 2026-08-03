import { AGENT_SYSTEM_PROMPT, getAgentRunner } from './agent';

/**
 * T0.5 — agent runtime entry without a Conversation row (Slack mentions, webhooks).
 */
export async function handleAgentAskWithoutConversation(input: {
  workspaceId: string;
  userId: string;
  clearanceLevel: number;
  elevated?: boolean;
  question: string;
}): Promise<string> {
  const runner = getAgentRunner();
  let text = '';
  for await (const event of runner({
    system: AGENT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: input.question }],
    toolContext: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      maxClearanceLevel: input.clearanceLevel,
      elevated: input.elevated,
    },
  })) {
    if (event.type === 'delta') text += event.text;
  }
  return text.trim();
}
