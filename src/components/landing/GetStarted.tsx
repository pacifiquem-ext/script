import React, { useState, useRef } from 'react';
import { IconArrowRight, IconSparkles, IconAttach } from '../../lib/icons';
import './GetStarted.css';

const SUGGESTIONS = [
  'What are the payment terms in this contract?',
  'Find invoices from March',
  'Summarize this document',
  'Who is the supplier in this file?',
];

export function GetStarted() {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const handleSubmit = (value: string) => {
    if (!value.trim()) return;
    window.location.href = `/app/chat?q=${encodeURIComponent(value.trim())}`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(prompt);
    }
  };

  return (
    <section className="get-started" id="get-started">
      <div className="container get-started__inner">
        <div className="get-started__header">
          <p className="text-subheading-md get-started__eyebrow">Get started</p>
          <h2 className="text-h3 get-started__title">
            Stop wasting time<br />searching for documents
          </h2>
          <p className="text-para-lg get-started__sub">
            Bring everything into one place and get the answers you need&mdash;faster,
            clearer, and with less effort.
          </p>
        </div>

        <div className="get-started__card">
          <div className="prompt-box">
            <textarea
              ref={textareaRef}
              className="prompt-box__textarea text-para-md"
              placeholder="Ask about your documents, contracts, or records…"
              value={prompt}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              rows={3}
            />

            <div className="prompt-box__footer">
              <div className="prompt-box__footer-left">
                <button className="prompt-box__attach" aria-label="Attach file">
                  <IconAttach size={18} />
                </button>
                <div className="prompt-box__model">
                  <IconSparkles size={13} />
                  <span className="text-label-xs">Workspace Assistant</span>
                </div>
              </div>
              <button
                className={`prompt-box__submit ${prompt.trim() ? 'prompt-box__submit--active' : ''}`}
                onClick={() => handleSubmit(prompt)}
                aria-label="Send"
                disabled={!prompt.trim()}
              >
                <IconArrowRight size={18} />
              </button>
            </div>
          </div>

          <div className="get-started__suggestions">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                className="suggestion-pill text-para-sm"
                onClick={() => {
                  setPrompt(s);
                  textareaRef.current?.focus();
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="get-started__bottom">
          <div className="get-started__bottom-cta">
            <a href="/app/login" className="btn btn--md btn--primary-filled get-started__cta">
              <span>Start Using It</span>
              <IconArrowRight size={16} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
