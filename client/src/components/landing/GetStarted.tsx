import React, { useState, useRef } from 'react';
import { IconArrowRight, IconSparkles, IconAttach } from '../../lib/icons';
import { Button } from '../ui/Button';

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
    <section className="pt-16 pb-32 bg-white max-sm:py-20" id="get-started">
      <div className="container flex flex-col items-center gap-12">
        <div className="flex flex-col items-center text-center gap-4">
          <p className="text-subheading-md text-neutral-400 tracking-[0.08em]">Get started</p>
          <h2 className="text-h3 max-w-[480px]">
            Stop wasting time
            <br />
            searching for documents
          </h2>
          <p className="text-para-lg max-w-[420px] text-neutral-600">
            Bring everything into one place and get the answers you need&mdash;faster, clearer, and
            with less effort.
          </p>
        </div>

        <div className="w-full max-w-[680px] flex flex-col gap-4">
          <div className="bg-white rounded-16 shadow-[0_0_0_1px_theme(colors.neutral.200),theme(boxShadow.lg)] overflow-hidden transition-shadow duration-200 flex flex-col focus-within:shadow-[0_0_0_1.5px_theme(colors.neutral.950),theme(boxShadow.xl)]">
            <textarea
              ref={textareaRef}
              className="flex-1 border-none outline-none resize-none bg-transparent font-sans text-neutral-950 leading-[1.6] min-h-[100px] max-h-[240px] overflow-y-auto px-5 pt-5 pb-3 placeholder:text-neutral-400 text-para-md"
              placeholder="Ask about your documents, contracts, or records…"
              value={prompt}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              rows={3}
            />

            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50">
              <div className="flex items-center gap-1">
                <button
                  className="flex items-center justify-center w-[34px] h-[34px] border-none bg-transparent text-neutral-400 cursor-pointer rounded-8 transition-all duration-200 hover:text-neutral-600 hover:bg-neutral-50 hover:-rotate-12 hover:scale-110"
                  aria-label="Attach file"
                >
                  <IconAttach size={18} />
                </button>
                <div className="flex items-center gap-[5px] text-neutral-600 px-2 py-1 rounded-8">
                  <IconSparkles size={13} />
                  <span className="text-label-xs">Workspace Assistant</span>
                </div>
              </div>
              <button
                className={`flex items-center justify-center w-[34px] h-[34px] border-none rounded-8 cursor-pointer transition-all duration-200 ${prompt.trim() ? 'bg-primary-base text-white hover:bg-primary-darker hover:scale-105' : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'}`}
                onClick={() => handleSubmit(prompt)}
                aria-label="Send"
                disabled={!prompt.trim()}
              >
                <IconArrowRight size={18} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-center max-sm:gap-2">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                className="px-[14px] py-[7px] max-sm:px-[12px] max-sm:py-[6px] max-sm:text-[12px] bg-white border border-neutral-200 rounded-full text-neutral-600 cursor-pointer font-sans text-[13px] transition-all duration-200 hover:bg-neutral-50 hover:text-neutral-950 hover:border-neutral-300 hover:shadow-xs text-para-sm"
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

        <div className="flex flex-col items-center">
          <div className="flex gap-3 flex-wrap justify-center">
            <Button
              size="md"
              as="a"
              href="/app/login"
              rightIcon={<IconArrowRight size={16} />}
              className="inline-flex items-center gap-2 no-underline"
            >
              <span>Start Using It</span>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
