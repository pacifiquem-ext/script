import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconSparkles, IconAttach } from '../../lib/icons';
import { useAuth } from '../../contexts/useAuth';

const SUGGESTIONS = [
  'What are the payment terms in this contract?',
  'Find invoices from March',
  'Summarize this document',
  'Who is the supplier in this file?',
];

export function GetStarted() {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const handleSubmit = (value: string) => {
    if (!value.trim() || isLoading) return;
    if (!isAuthenticated) {
      navigate('/app/signup', { state: { next: '/app/chat', initialMessage: value.trim() } });
      return;
    }
    navigate('/app/chat', { state: { initialMessage: value.trim() } });
  };

  return (
    <section className="pt-16 pb-32 bg-white max-sm:py-20" id="get-started">
      <div className="container flex flex-col items-center gap-12">
        <div className="flex flex-col items-center text-center gap-4">
          <p className="text-subheading-md text-neutral-400 tracking-[0.08em]">Get started</p>
          <h2 className="text-h3 text-neutral-950 max-w-xl">Ask your documents anything</h2>
        </div>
        <div className="w-full max-w-2xl bg-neutral-50 rounded-[20px] p-2 shadow-[0_0_0_1px_theme(colors.neutral.200),theme(boxShadow.lg)]">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={handleInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(prompt);
              }
            }}
            placeholder="Ask about your documents, contracts, or records…"
            className="w-full border-none outline-none resize-none bg-transparent font-sans text-neutral-950 min-h-[100px] max-h-[240px] px-5 pt-5 pb-3 placeholder:text-neutral-400 text-para-md"
            aria-label="Get started prompt"
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <IconAttach size={18} className="text-neutral-400" />
            <button
              type="button"
              disabled={!prompt.trim() || isLoading}
              onClick={() => handleSubmit(prompt)}
              className={`flex items-center justify-center w-[34px] h-[34px] border-none rounded-8 cursor-pointer ${prompt.trim() ? 'bg-primary-base text-white' : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'}`}
              aria-label="Submit prompt"
            >
              <IconSparkles size={16} />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="px-3 py-1.5 rounded-full border border-neutral-200 text-para-xs text-neutral-600 hover:bg-neutral-50"
              onClick={() => handleSubmit(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
