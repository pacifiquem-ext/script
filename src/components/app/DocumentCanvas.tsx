import React, { useState } from 'react';
import { IconClose, IconDocument, IconGrid } from '../../lib/icons';

interface FileItem {
  id: string;
  name: string;
  type: string;
  size: string;
  date: string;
}

interface Props {
  file: FileItem;
  onClose: () => void;
  className?: string;
}

const TYPE_COLOR: Record<string, string> = { pdf: '#e54d2e', doc: '#0070f3', xls: '#1a7f3c', txt: '#737373' };

export function DocumentCanvas({ file, onClose, className = "w-[50%] min-w-[320px] border-l border-neutral-200 animate-[slideInRight_0.4s_cubic-bezier(0.16,1,0.3,1)] max-md:w-full max-md:absolute max-md:inset-0 max-md:z-[100] max-md:border-l-0" }: Props) {
  // Document Content State (Mock)
  const [documentContent, setDocumentContent] = useState(`This is the extracted text content for ${file.name}.

1. PAYMENT TERMS
The Buyer agrees to pay the Seller the total amount of $50,000. Payment is due within 30 days of the invoice date. Late payments will incur a 2% penalty per month.

2. DELIVERY
The Seller agrees to deliver the goods to the Buyer's warehouse by June 15th, 2026. Risk of loss passes to the Buyer upon delivery.

3. CONFIDENTIALITY
Both parties agree to keep the terms of this agreement confidential for a period of 5 years from the date of signing.`);

  return (
    <div className={`flex flex-col h-full bg-neutral-50 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-[16px_20px] border-b border-neutral-200 shrink-0 bg-white">
        <div className="flex items-center gap-3 overflow-hidden">
          <span className="shrink-0 px-2 py-1 rounded-6 text-[10px] font-bold tracking-[0.05em] text-white" style={{ background: TYPE_COLOR[file.type] || '#737373' }}>
            {file.type.toUpperCase()}
          </span>
          <div>
            <p className="text-label-md text-neutral-950 whitespace-nowrap overflow-hidden text-ellipsis max-w-[240px]">{file.name}</p>
            <p className="text-para-xs text-neutral-400">{file.size} · {file.date}</p>
          </div>
        </div>
        <button className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 shrink-0 hover:text-neutral-950 hover:bg-neutral-50" onClick={onClose} aria-label="Close">
          <IconClose size={18} />
        </button>
      </div>

      {/* Metadata Extraction Bar */}
      <div className="flex items-center gap-4 p-3 bg-white border-b border-neutral-200 shrink-0 overflow-x-auto whitespace-nowrap">
        <span className="flex items-center gap-1.5 text-para-xs font-medium text-neutral-600 bg-neutral-100 p-[4px_8px] rounded-6">
          <IconDocument size={12} /> Supplier Agreement
        </span>
        <span className="flex items-center gap-1.5 text-para-xs font-medium text-neutral-600 bg-neutral-100 p-[4px_8px] rounded-6">
          <IconGrid size={12} /> $50,000 USD
        </span>
        <span className="flex items-center gap-1.5 text-para-xs font-medium text-neutral-600 bg-neutral-100 p-[4px_8px] rounded-6">
          <IconGrid size={12} /> June 15th, 2026
        </span>
      </div>

      {/* Document Text Editor */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="bg-white border border-neutral-200 shadow-sm rounded-12 p-6 min-h-full">
          <textarea 
            className="w-full h-full min-h-[400px] border-none outline-none resize-none bg-transparent text-para-md text-neutral-950 leading-[1.7] font-sans"
            value={documentContent}
            onChange={(e) => setDocumentContent(e.target.value)}
            placeholder="Document content..."
          />
        </div>
      </div>
    </div>
  );
}
