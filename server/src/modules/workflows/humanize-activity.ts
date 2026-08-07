/**
 * Turn agent tool/status noise into plain language for the Activity panel.
 * Prefer this over raw tool ids and JSON payloads.
 */

function prettyHost(urlOrHost: string): string {
  try {
    const withProto = /^https?:\/\//i.test(urlOrHost) ? urlOrHost : `https://${urlOrHost}`;
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./i, '');
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    return path ? `${host}${path}` : host;
  } catch {
    return urlOrHost.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }
}

function asRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Human label for a tool call. */
export function humanizeToolCall(
  toolName: string,
  input: unknown,
): { message: string; detail?: string } {
  const args = asRecord(input);
  switch (toolName) {
    case 'browser_navigate': {
      const url = str(args.url) ?? 'a page';
      return { message: `Opening ${prettyHost(url)}` };
    }
    case 'browser_snapshot':
      return { message: 'Reading what’s on the page' };
    case 'browser_click': {
      const text = str(args.text);
      const selector = str(args.selector);
      if (text) return { message: `Clicking “${text.slice(0, 80)}”` };
      if (selector) return { message: 'Clicking a control on the page' };
      return { message: 'Clicking on the page' };
    }
    case 'browser_type': {
      const label = str(args.text) ?? str(args.selector);
      return {
        message: label ? `Typing into “${label.slice(0, 60)}”` : 'Typing into a field',
      };
    }
    case 'browser_press': {
      const key = str(args.key) ?? 'a key';
      return { message: `Pressing ${key}` };
    }
    case 'browser_wait': {
      const text = str(args.text);
      if (text) return { message: `Waiting for “${text.slice(0, 60)}” to appear` };
      return { message: 'Waiting a moment for the page' };
    }
    case 'complete_workflow_step':
      return { message: 'Marking a step complete with evidence' };
    case 'get_my_workflow_progress':
      return { message: 'Checking remaining steps' };
    case 'get_workflow':
      return { message: 'Loading workflow instructions' };
    case 'list_workflows':
      return { message: 'Listing workflows' };
    default:
      return { message: toolName.replace(/_/g, ' ') };
  }
}

/** Human label for a tool result. */
export function humanizeToolResult(
  toolName: string,
  ok: boolean,
  detail?: string,
  input?: unknown,
): { message: string; detail?: string } {
  const args = asRecord(input);
  if (!ok) {
    const reason = detail?.trim() || 'something went wrong';
    // Avoid dumping JSON failures
    if (reason.startsWith('{') || reason.startsWith('[')) {
      return { message: 'That action failed — see the note below', detail: reason.slice(0, 300) };
    }
    return { message: `Couldn’t finish that action`, detail: reason.slice(0, 500) };
  }

  switch (toolName) {
    case 'browser_navigate': {
      const url = str(args.url);
      // detail often includes landed URL/title from executor
      if (detail && /landed on|opened/i.test(detail)) {
        return { message: detail.length > 160 ? `${detail.slice(0, 160)}…` : detail };
      }
      if (url) return { message: `Opened ${prettyHost(url)}` };
      return { message: 'Page opened successfully' };
    }
    case 'browser_snapshot':
      if (detail && detail.includes('url=')) {
        const m = detail.match(/url=(\S+)/);
        const host = m?.[1] ? prettyHost(m[1]) : null;
        return { message: host ? `Page ready at ${host}` : 'Page content read' };
      }
      return { message: 'Page content read' };
    case 'browser_click':
      return { message: 'Click completed' };
    case 'browser_type':
      return { message: 'Finished typing' };
    case 'complete_workflow_step':
      return { message: 'Step marked complete' };
    default:
      return { message: 'Done' };
  }
}

export function humanizePhase(message: string): string {
  return message
    .replace(
      /Phase 1: auto-navigate steps \(no LLM\)/i,
      'Quick web steps (open links automatically)',
    )
    .replace(
      /Phase 2: workflow agent for (\d+) remaining step\(s\)/i,
      'Working through $1 remaining step(s) with the agent',
    )
    .replace(/Starting agent execution…/i, 'Starting the agent…')
    .replace(/Polishing workflow instructions…/i, 'Polishing instructions for clarity…');
}

/** Soften model reasoning for display (trim, collapse whitespace). */
export function humanizeReasoning(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 1500);
}
