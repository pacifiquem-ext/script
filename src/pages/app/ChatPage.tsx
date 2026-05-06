import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { IconArrowRight, IconAttach, IconSparkles, IconFile, IconDocFile, IconZap, IconArrowUp, IconChevronDown, IconDocument } from '../../lib/icons';
import { DocumentCanvas } from '../../components/app/DocumentCanvas';

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

function MentionChip({ file, onClick }: { file: MentionedFile, onClick?: (file: MentionedFile) => void }) {
  return (
    <span
      className={`inline-flex items-center gap-[5px] px-[5px] py-[1px] pr-[7px] bg-neutral-50 border border-neutral-200 rounded-full text-[12px] font-medium text-neutral-600 align-middle mx-[2px] whitespace-nowrap ${onClick ? 'cursor-pointer hover:border-neutral-300 hover:bg-white hover:shadow-sm' : ''}`}
      onClick={() => onClick?.(file)}
    >
      <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: TYPE_BADGE[file.type] || '#737373' }} />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">{file.name}</span>
    </span>
  );
}

function MessageBubble({ msg, onCopy, onMentionClick }: { msg: Message; onCopy: (text: string) => void; onMentionClick?: (file: MentionedFile) => void }) {
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
      parts.push(<MentionChip key={`m${i}`} file={m} onClick={onMentionClick} />);
      lastIdx = idx + tag.length;
    });
    if (lastIdx < text.length) parts.push(<span key="tail">{text.slice(lastIdx)}</span>);
    return <>{parts}</>;
  };

  if (msg.role === 'user') {
    return (
      <div className="flex gap-3 items-end flex-row-reverse group">
        <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 flex-row-reverse pr-0.5 order-2">
          <span className="text-neutral-400 text-[11px]">{formatTime(msg.timestamp)}</span>
          <button
            className="flex items-center justify-center w-[22px] h-[22px] bg-transparent border-none cursor-pointer text-neutral-400 rounded-6 transition-colors duration-200 p-0 hover:text-neutral-600 hover:bg-neutral-200"
            onClick={handleCopy}
            aria-label="Copy"
            title={copied ? 'Copied!' : 'Copy'}
          >
            {copied ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M3 11V3a1 1 0 011-1h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            )}
          </button>
        </div>
        <div className="px-3.5 py-2.5 rounded-12 leading-[1.65] text-neutral-950 break-words text-para-md bg-neutral-50 shadow-[inset_0_0_0_1px_theme(colors.neutral.200)] rounded-br-4 max-w-full order-1">{renderContent()}</div>
        <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 bg-neutral-200 text-neutral-600 text-[11px] font-semibold tracking-[0.02em] border-[1.5px] border-neutral-200">JB</div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 items-end group">
      <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 bg-neutral-950 text-white">
        <IconSparkles size={13} />
      </div>
      <div className="flex flex-col gap-1 max-w-[78%]">
        <div className="px-3.5 py-2.5 rounded-12 leading-[1.65] text-neutral-950 break-words text-para-md bg-white shadow-[inset_0_0_0_1px_theme(colors.neutral.200)] rounded-bl-4">{msg.content}</div>
        <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 pl-0.5">
          <span className="text-neutral-400 text-[11px]">{formatTime(msg.timestamp)}</span>
          <button
            className="flex items-center justify-center w-[22px] h-[22px] bg-transparent border-none cursor-pointer text-neutral-400 rounded-6 transition-colors duration-200 p-0 hover:text-neutral-600 hover:bg-neutral-200"
            onClick={handleCopy}
            aria-label="Copy"
            title={copied ? 'Copied!' : 'Copy'}
          >
            {copied ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M3 11V3a1 1 0 011-1h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChatPage() {
  const location = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [atCursor, setAtCursor] = useState(0);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [previewFile, setPreviewFile] = useState<MentionedFile | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialMessageHandled = useRef(false);

  // Handle initial message from Library page navigation
  useEffect(() => {
    if (initialMessageHandled.current) return;
    const state = location.state as { initialMessage?: string; quotedFiles?: MentionedFile[] } | null;
    if (state?.initialMessage) {
      initialMessageHandled.current = true;
      const mentions = state.quotedFiles || [];
      setTimeout(() => {
        sendMessage(state.initialMessage!, mentions);
      }, 300);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Legacy query param support
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
    navigator.clipboard.writeText(text).catch(() => { });
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full overflow-hidden bg-white relative">
      <div className="flex-1 flex flex-col min-w-0 relative h-full transition-all duration-300">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,theme(colors.neutral.200)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.neutral.200)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none z-0" aria-hidden />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_110%_55%_at_50%_0%,transparent_0%,theme(colors.neutral.0)_72%)] pointer-events-none z-10" aria-hidden />

        <div className="flex-1 overflow-y-auto p-[24px_16px] relative z-20">
          <div className="max-w-[720px] mx-auto flex flex-col gap-5">
            {isEmpty ? (
              <div className="flex flex-col items-center text-center p-[80px_24px] gap-4">
                <div className="w-14 h-14 bg-neutral-50 rounded-16 border border-neutral-200 flex items-center justify-center text-neutral-400"><IconFile size={28} /></div>
                <h2 className="text-h6 text-neutral-950">Ask about your documents</h2>
                <p className="text-para-sm text-neutral-600 max-w-[400px] leading-[1.7]">
                  Upload a document or open one from your library.<br />
                  Extract details, find information, and get answers instantly.
                </p>
                <div className="flex flex-wrap gap-2 justify-center w-full max-w-[560px] mt-2">
                  {EXAMPLE_PROMPTS.map((p, i) => (
                    <button key={i} className="px-3.5 py-[7px] bg-white border border-neutral-200 rounded-full text-neutral-600 cursor-pointer font-sans text-[13px] transition-colors duration-200 text-para-sm hover:bg-neutral-50 hover:text-neutral-950 hover:border-neutral-300" onClick={() => sendMessage(p, [])}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} onCopy={handleCopy} onMentionClick={setPreviewFile} />
              ))
            )}
            {loading && (
              <div className="flex gap-3 items-end">
                <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 bg-neutral-950 text-white">
                  <IconSparkles size={13} />
                </div>
                <div className="flex flex-col gap-1 max-w-[78%]">
                  <div className="flex items-center gap-1 px-4 py-3.5 bg-white shadow-[inset_0_0_0_1px_theme(colors.neutral.200)] rounded-12 rounded-bl-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-[bounce_1.2s_infinite_ease-in-out]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-[bounce_1.2s_infinite_ease-in-out_0.2s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-[bounce_1.2s_infinite_ease-in-out_0.4s]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="p-[16px_16px_20px] bg-transparent flex flex-col items-center gap-2 relative z-20">
          <div className="w-full max-w-[720px] relative flex flex-col">
            {atQuery !== null && filteredFiles.length > 0 && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 bg-white rounded-12 shadow-[0_0_0_1px_theme(colors.neutral.200),theme(boxShadow.xl)] p-2 max-h-[260px] overflow-y-auto animate-[fadeUp_0.15s_ease]">
                <p className="text-subheading-md text-neutral-400 tracking-[0.06em] p-[4px_8px_6px]">Files</p>
                {filteredFiles.map((file, i) => (
                  <button
                    key={file.id}
                    className={`flex items-center gap-2.5 w-full p-[7px_8px] bg-transparent border-none cursor-pointer font-sans rounded-8 text-left transition-colors duration-200 ${i === mentionHighlight ? 'bg-neutral-50' : 'hover:bg-neutral-50'}`}
                    onMouseDown={e => { e.preventDefault(); insertMention(file); }}
                  >
                    <span className="shrink-0 px-1.5 py-0.5 rounded-4 text-[9px] font-bold tracking-[0.05em] text-white" style={{ background: TYPE_BADGE[file.type] || '#737373' }}>
                      {file.type.toUpperCase()}
                    </span>
                    <span className="text-para-sm text-neutral-950 overflow-hidden text-ellipsis whitespace-nowrap">{file.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="w-full bg-neutral-50 rounded-[20px] p-[6px_6px_8px] flex flex-col gap-1.5 shadow-[0_0_0_1px_theme(colors.neutral.200),theme(boxShadow.lg)] transition-shadow duration-200 focus-within:shadow-[0_0_0_1.5px_theme(colors.neutral.300),theme(boxShadow.lg)]">

              <div className="flex items-center gap-2 px-3 pt-1 pb-1">
                <IconZap size={14} className="text-neutral-400" />
                <span className="text-[13px] text-neutral-600 font-medium">
                  You are remaining with <span className="text-primary-base font-semibold">1,450</span> credits
                </span>
                <span className="text-[13px] text-neutral-400">·</span>
                <button className="bg-transparent border-none cursor-pointer text-[13px] font-semibold text-primary-base hover:text-primary-darker transition-colors p-0">
                  Upgrade
                </button>
              </div>

              <div className="bg-white rounded-[14px] shadow-sm border border-neutral-200 flex flex-col overflow-hidden relative">

                <textarea
                  ref={textareaRef}
                  className="flex-1 border-none outline-none resize-none bg-transparent font-sans text-neutral-950 leading-[1.6] min-h-[60px] max-h-[200px] overflow-y-auto p-[8px_16px] placeholder:text-neutral-400 text-para-md"
                  placeholder="Describe your legal issue..."
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  rows={2}
                />
                <div className="flex items-center justify-between p-[8px_12px_12px_12px]">
                  <div className="flex items-center gap-1">
                    <button className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 hover:text-neutral-600 hover:bg-neutral-200" aria-label="Attach">
                      <IconAttach size={17} />
                    </button>
                    {/* Render active mentions as chips in the footer */}
                    {extractMentions(input).map(f => (
                      <span key={f.id} className="inline-flex items-center gap-[5px] px-[8px] py-[3px] bg-white border border-neutral-200 rounded-full text-[11px] font-medium text-neutral-600 whitespace-nowrap max-w-[180px] overflow-hidden">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TYPE_BADGE[f.type] || '#737373' }} />
                        <IconDocFile size={12} />
                        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{f.name}</span>
                      </span>
                    ))}
                  </div>
                  <button
                    className={`flex items-center justify-center w-8 h-8 border-none rounded-8 cursor-pointer transition-all duration-200 ${input.trim() ? 'bg-primary-base text-white hover:bg-primary-darker hover:scale-105' : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'}`}
                    onClick={sendMessageFromInput}
                    disabled={!input.trim() || loading}
                    aria-label="Send"
                  >
                    <IconArrowUp size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-neutral-400 text-center max-w-[700px] leading-[1.6] mt-4 mb-2">
            Script AI only provides insights based on your uploaded documents.
          </p>
        </div>
      </div>

      {previewFile && (
        <DocumentCanvas file={{ ...previewFile, size: 'Unknown', date: 'Just now' }} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
}
