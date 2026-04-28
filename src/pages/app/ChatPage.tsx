import React, { useState, useRef, useEffect, useCallback } from 'react';
import { IconArrowRight, IconAttach, IconSparkles, IconFile, IconDocFile } from '../../lib/icons';
import './ChatPage.css';

interface MentionedFile {
  id: string;
  name: string;
  type: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mentions?: MentionedFile[];
  timestamp: Date;
}

const ALL_FILES = [
  { id: 'f1', name: 'Supplier Agreement – March 2026.pdf', type: 'pdf' },
  { id: 'f2', name: 'NDA – Acme Corp.pdf', type: 'pdf' },
  { id: 'f3', name: 'Service Contract Q1.doc', type: 'doc' },
  { id: 'f4', name: 'Invoice #1042 – March.pdf', type: 'pdf' },
  { id: 'f5', name: 'Q1 2026 Financial Summary.xls', type: 'xls' },
  { id: 'f6', name: 'Employee Handbook 2026.pdf', type: 'pdf' },
  { id: 'f7', name: 'IT Setup Guide.doc', type: 'doc' },
];

const EXAMPLE_PROMPTS = [
  'What are the payment terms in this contract?',
  'Find invoices from March',
  'Summarize this document',
  'Who is the supplier in this file?',
];

function generateResponse(): string {
  return 'I found 3 documents that match your query. The most relevant is "Supplier Agreement – March 2026.pdf". The payment terms state net-30 from invoice date, with a 2% early payment discount if settled within 10 days. Would you like me to extract the full payment clause?';
}

const TYPE_BADGE: Record<string, string> = { pdf: '#e54d2e', doc: '#0070f3', xls: '#1a7f3c', txt: '#737373' };

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MentionChip({ file }: { file: MentionedFile }) {
  return (
    <span className="mention-chip">
      <span className="mention-chip__dot" style={{ background: TYPE_BADGE[file.type] || '#737373' }} />
      <span className="mention-chip__name">{file.name}</span>
    </span>
  );
}

function MessageBubble({ msg, onCopy }: { msg: Message; onCopy: (text: string) => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const renderContent = () => {
    if (!msg.mentions || msg.mentions.length === 0) return <span>{msg.content}</span>;
    let text = msg.content;
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    msg.mentions.forEach((m, i) => {
      const tag = `@${m.name}`;
      const idx = text.indexOf(tag, lastIdx);
      if (idx === -1) return;
      if (idx > lastIdx) parts.push(<span key={`t${i}`}>{text.slice(lastIdx, idx)}</span>);
      parts.push(<MentionChip key={`m${i}`} file={m} />);
      lastIdx = idx + tag.length;
    });
    if (lastIdx < text.length) parts.push(<span key="tail">{text.slice(lastIdx)}</span>);
    return <>{parts}</>;
  };

  if (msg.role === 'user') {
    return (
      <div className="chat-message chat-message--user">
        <div className="chat-message__meta chat-message__meta--user">
          <span className="chat-message__time text-para-xs">{formatTime(msg.timestamp)}</span>
          <button
            className="chat-message__action"
            onClick={handleCopy}
            aria-label="Copy"
            title={copied ? 'Copied!' : 'Copy'}
          >
            {copied ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M3 11V3a1 1 0 011-1h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            )}
          </button>
        </div>
        <div className="chat-message__bubble text-para-md">{renderContent()}</div>
        <div className="chat-message__avatar chat-message__avatar--user">JB</div>
      </div>
    );
  }

  return (
    <div className="chat-message chat-message--assistant">
      <div className="chat-message__avatar chat-message__avatar--ai">
        <IconSparkles size={13} />
      </div>
      <div className="chat-message__body">
        <div className="chat-message__bubble text-para-md">{msg.content}</div>
        <div className="chat-message__meta chat-message__meta--ai">
          <span className="chat-message__time text-para-xs">{formatTime(msg.timestamp)}</span>
          <button
            className="chat-message__action"
            onClick={handleCopy}
            aria-label="Copy"
            title={copied ? 'Copied!' : 'Copy'}
          >
            {copied ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M3 11V3a1 1 0 011-1h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [atCursor, setAtCursor] = useState(0);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) sendMessage(q, []);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filteredFiles = atQuery !== null
    ? ALL_FILES.filter(f => f.name.toLowerCase().includes(atQuery.toLowerCase()))
    : [];

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@([\w\s\-–.]*)$/);
    if (atMatch) {
      setAtQuery(atMatch[1]);
      setAtCursor(cursor - atMatch[0].length);
      setMentionHighlight(0);
    } else {
      setAtQuery(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (atQuery !== null && filteredFiles.length > 0) {
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionHighlight(i => (i - 1 + filteredFiles.length) % filteredFiles.length); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionHighlight(i => (i + 1) % filteredFiles.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredFiles[mentionHighlight]); return; }
      if (e.key === 'Escape') { setAtQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessageFromInput();
    }
  };

  const insertMention = (file: { id: string; name: string; type: string }) => {
    const before = input.slice(0, atCursor);
    const after = input.slice(textareaRef.current?.selectionStart ?? input.length);
    const newVal = `${before}@${file.name} ${after}`;
    setInput(newVal);
    setAtQuery(null);
    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = atCursor + file.name.length + 2;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const extractMentions = (text: string): MentionedFile[] => {
    const found: MentionedFile[] = [];
    ALL_FILES.forEach(f => {
      if (text.includes(`@${f.name}`)) found.push(f);
    });
    return found;
  };

  const sendMessageFromInput = () => sendMessage(input, extractMentions(input));

  const sendMessage = useCallback((text: string, mentions: MentionedFile[]) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: trimmed, mentions, timestamp: new Date() }]);
    setInput('');
    setAtQuery(null);
    setLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setTimeout(() => {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: generateResponse(), timestamp: new Date() }]);
      setLoading(false);
    }, 900);
  }, [loading]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="chat-page">
      <div className="chat-messages">
        <div className="chat-messages__inner">
          {isEmpty ? (
            <div className="chat-empty">
              <div className="chat-empty__icon"><IconFile size={28} /></div>
              <h2 className="text-h6 chat-empty__title">Ask about your documents</h2>
              <p className="text-para-sm chat-empty__sub">
                Upload a document or open one from your library.<br />
                Extract details, find information, and get answers instantly.
              </p>
              <div className="chat-empty__prompts">
                {EXAMPLE_PROMPTS.map((p, i) => (
                  <button key={i} className="chat-empty__prompt text-para-sm" onClick={() => sendMessage(p, [])}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} onCopy={handleCopy} />
            ))
          )}
          {loading && (
            <div className="chat-message chat-message--assistant">
              <div className="chat-message__avatar chat-message__avatar--ai">
                <IconSparkles size={13} />
              </div>
              <div className="chat-message__body">
                <div className="chat-message__bubble chat-message__bubble--loading">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="chat-input-area">
        <div className="chat-prompt-box-wrap">
          {atQuery !== null && filteredFiles.length > 0 && (
            <div className="chat-mention-dropup">
              <p className="text-subheading-md chat-mention-dropup__label">Files</p>
              {filteredFiles.map((file, i) => (
                <button
                  key={file.id}
                  className={`chat-mention-item ${i === mentionHighlight ? 'chat-mention-item--active' : ''}`}
                  onMouseDown={e => { e.preventDefault(); insertMention(file); }}
                >
                  <span className="chat-mention-item__badge" style={{ background: TYPE_BADGE[file.type] || '#737373' }}>
                    {file.type.toUpperCase()}
                  </span>
                  <span className="text-para-sm chat-mention-item__name">{file.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="chat-prompt-box">
            <textarea
              ref={textareaRef}
              className="chat-prompt-box__textarea text-para-md"
              placeholder="Ask about your documents… use @ to tag a file"
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              rows={3}
            />
            <div className="chat-prompt-box__footer">
              <div className="chat-prompt-box__footer-left">
                <button className="chat-prompt-box__attach" aria-label="Attach">
                  <IconAttach size={17} />
                </button>
                {/* Render active mentions as chips in the footer */}
                {extractMentions(input).map(f => (
                  <span key={f.id} className="input-mention-chip">
                    <span className="input-mention-chip__dot" style={{ background: TYPE_BADGE[f.type] || '#737373' }} />
                    <IconDocFile size={12} />
                    <span className="input-mention-chip__name">{f.name}</span>
                  </span>
                ))}
              </div>
              <button
                className={`chat-prompt-box__send ${input.trim() ? 'chat-prompt-box__send--active' : ''}`}
                onClick={sendMessageFromInput}
                disabled={!input.trim() || loading}
                aria-label="Send"
              >
                <IconArrowRight size={17} />
              </button>
            </div>
          </div>
        </div>
        <p className="text-para-xs chat-input-area__disclaimer">
          Responses are based on your uploaded documents only.
        </p>
      </div>
    </div>
  );
}
