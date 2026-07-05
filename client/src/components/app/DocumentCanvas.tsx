import React from 'react';
import { IconClose } from '../../lib/icons';

interface Props {
  file: { id: string; name: string; type?: string; status?: string };
  content: string | null;
  loading?: boolean;
  onClose: () => void;
  className?: string;
}

const TYPE_COLOR: Record<string, string> = {
  pdf: '#e54d2e',
  doc: '#0070f3',
  docx: '#0070f3',
  txt: '#737373',
};

function extOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || 'txt';
}

export function DocumentCanvas({
  file,
  content,
  loading,
  onClose,
  className = 'w-[50%] min-w-[320px] border-l border-neutral-200 animate-[slideInRight_0.4s_cubic-bezier(0.16,1,0.3,1)] max-md:w-full max-md:absolute max-md:inset-0 max-md:z-[100] max-md:border-l-0',
}: Props) {
  const ext = file.type || extOf(file.name);
  return (
    <div className={`flex flex-col h-full bg-neutral-50 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between p-[16px_20px] border-b border-neutral-200 shrink-0 bg-white">
        <div className="flex items-center gap-3 overflow-hidden">
          <span
            className="shrink-0 px-2 py-1 rounded-6 text-[10px] font-bold tracking-[0.05em] text-white uppercase"
            style={{ background: TYPE_COLOR[ext] || '#737373' }}
          >
            {ext}
          </span>
          <div className="min-w-0">
            <p className="text-label-sm text-neutral-950 truncate">{file.name}</p>
            {file.status && (
              <p className="text-para-xs text-neutral-400 capitalize">{file.status}</p>
            )}
          </div>
        </div>
        <button
          className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 hover:text-neutral-950 hover:bg-neutral-100"
          onClick={onClose}
          aria-label="Close"
        >
          <IconClose size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <p className="text-para-sm text-neutral-500">Loading document…</p>
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-para-sm text-neutral-800 leading-6">
            {content?.trim() ||
              'No extracted text yet. If status is pending/processing, wait for ingestion to finish.'}
          </pre>
        )}
      </div>
    </div>
  );
}
