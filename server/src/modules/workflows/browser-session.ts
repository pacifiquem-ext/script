import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from 'playwright';
import { logger } from '../../lib/logger';

const IDLE_MS = 15 * 60 * 1000;
const MAX_SNAPSHOT_CHARS = 12_000;

export type BrowserSnapshot = {
  url: string;
  title: string;
  text: string;
};

type Session = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  lastUsed: number;
  actions: string[];
};

const sessions = new Map<string, Session>();

let sweeping = false;

function ensureSweep(): void {
  if (sweeping) return;
  sweeping = true;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, session] of sessions) {
      if (now - session.lastUsed > IDLE_MS) {
        void closeBrowserSession(key);
      }
    }
  }, 60_000);
  if (typeof timer.unref === 'function') timer.unref();
}

export type BrowserSessionOptions = {
  storageState?: BrowserContextOptions['storageState'];
};

async function createSession(opts?: BrowserSessionOptions): Promise<Session> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const contextOptions: BrowserContextOptions = {
    viewport: { width: 1280, height: 720 },
    userAgent:
      'Mozilla/5.0 (compatible; ScriptWorkflowAgent/1.0; +https://script.local) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  };
  if (opts?.storageState) {
    contextOptions.storageState = opts.storageState;
  }
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  return { browser, context, page, lastUsed: Date.now(), actions: [] };
}

export async function getBrowserSession(
  sessionKey: string,
  opts?: BrowserSessionOptions,
): Promise<Session> {
  ensureSweep();
  let session = sessions.get(sessionKey);
  if (!session) {
    session = await createSession(opts);
    sessions.set(sessionKey, session);
    logger.info({ sessionKey }, 'workflow browser session opened');
  }
  session.lastUsed = Date.now();
  return session;
}

export async function closeBrowserSession(sessionKey: string): Promise<void> {
  const session = sessions.get(sessionKey);
  if (!session) return;
  sessions.delete(sessionKey);
  try {
    await session.context.close();
  } catch {
    // ignore
  }
  try {
    await session.browser.close();
  } catch {
    // ignore
  }
  logger.info({ sessionKey }, 'workflow browser session closed');
}

export function recordBrowserAction(sessionKey: string, action: string): void {
  const session = sessions.get(sessionKey);
  if (!session) return;
  session.actions.push(action);
  if (session.actions.length > 50) session.actions.shift();
  session.lastUsed = Date.now();
}

export function getBrowserActions(sessionKey: string): string[] {
  return sessions.get(sessionKey)?.actions.slice() ?? [];
}

export async function browserNavigate(sessionKey: string, url: string): Promise<BrowserSnapshot> {
  const session = await getBrowserSession(sessionKey);
  let target = url.trim();
  if (!/^https?:\/\//i.test(target)) {
    target = `https://${target}`;
  }
  await session.page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  recordBrowserAction(sessionKey, `navigate ${target}`);
  return browserSnapshot(sessionKey);
}

export async function browserSnapshot(sessionKey: string): Promise<BrowserSnapshot> {
  const session = await getBrowserSession(sessionKey);
  const page = session.page;
  const url = page.url();
  const title = await page.title().catch(() => '');
  let text = '';
  try {
    text = await page.evaluate(`(() => {
      const body = document.body;
      if (!body) return '';
      const clone = body.cloneNode(true);
      for (const el of clone.querySelectorAll('script, style, noscript, svg')) {
        el.remove();
      }
      return (clone.innerText || clone.textContent || '').replace(/\\s+\\n/g, '\\n').trim();
    })()`);
  } catch {
    text = '';
  }
  if (text.length > MAX_SNAPSHOT_CHARS) {
    text = `${text.slice(0, MAX_SNAPSHOT_CHARS)}\n…[truncated]`;
  }
  session.lastUsed = Date.now();
  return { url, title, text };
}

export async function browserClick(
  sessionKey: string,
  opts: { selector?: string; text?: string },
): Promise<BrowserSnapshot> {
  const session = await getBrowserSession(sessionKey);
  const page = session.page;
  if (opts.selector) {
    await page.click(opts.selector, { timeout: 15_000 });
    recordBrowserAction(sessionKey, `click selector=${opts.selector}`);
  } else if (opts.text) {
    const locator = page.getByText(opts.text, { exact: false }).first();
    await locator.click({ timeout: 15_000 });
    recordBrowserAction(sessionKey, `click text=${opts.text}`);
  } else {
    throw new Error('browser_click requires selector or text');
  }
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  return browserSnapshot(sessionKey);
}

export async function browserType(
  sessionKey: string,
  opts: { selector?: string; text?: string; value: string; clear?: boolean },
): Promise<BrowserSnapshot> {
  const session = await getBrowserSession(sessionKey);
  const page = session.page;
  if (opts.selector) {
    if (opts.clear) await page.fill(opts.selector, '');
    await page.fill(opts.selector, opts.value, { timeout: 15_000 });
    recordBrowserAction(sessionKey, `type selector=${opts.selector}`);
  } else if (opts.text) {
    const locator = page.getByLabel(opts.text, { exact: false }).first();
    try {
      if (opts.clear) await locator.fill('');
      await locator.fill(opts.value, { timeout: 10_000 });
    } catch {
      const byPlaceholder = page.getByPlaceholder(opts.text, { exact: false }).first();
      if (opts.clear) await byPlaceholder.fill('');
      await byPlaceholder.fill(opts.value, { timeout: 10_000 });
    }
    recordBrowserAction(sessionKey, `type label/placeholder=${opts.text}`);
  } else {
    throw new Error('browser_type requires selector or text (label/placeholder)');
  }
  return browserSnapshot(sessionKey);
}

export async function browserPress(sessionKey: string, key: string): Promise<BrowserSnapshot> {
  const session = await getBrowserSession(sessionKey);
  await session.page.keyboard.press(key);
  recordBrowserAction(sessionKey, `press ${key}`);
  await session.page.waitForLoadState('domcontentloaded').catch(() => undefined);
  return browserSnapshot(sessionKey);
}

export async function browserWait(
  sessionKey: string,
  opts: { ms?: number; text?: string },
): Promise<BrowserSnapshot> {
  const session = await getBrowserSession(sessionKey);
  if (opts.text) {
    await session.page
      .getByText(opts.text, { exact: false })
      .first()
      .waitFor({
        state: 'visible',
        timeout: Math.min(opts.ms ?? 15_000, 30_000),
      });
    recordBrowserAction(sessionKey, `wait text=${opts.text}`);
  } else {
    const ms = Math.min(Math.max(opts.ms ?? 1000, 100), 15_000);
    await session.page.waitForTimeout(ms);
    recordBrowserAction(sessionKey, `wait ${ms}ms`);
  }
  return browserSnapshot(sessionKey);
}

/** Test helper: force-close all sessions. */
export async function closeAllBrowserSessions(): Promise<void> {
  const keys = [...sessions.keys()];
  await Promise.all(keys.map((k) => closeBrowserSession(k)));
}
