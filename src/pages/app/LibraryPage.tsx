import React, { useState, useMemo } from 'react';
import { IconClose, IconFile, IconUpload, IconSearch } from '../../lib/icons';
import './LibraryPage.css';

interface FileItem {
  id: string;
  name: string;
  type: 'pdf' | 'doc' | 'xls' | 'txt';
  size: string;
  date: string;
  folder: string;
}

interface FolderItem {
  id: string;
  name: string;
  count: number;
  files: FileItem[];
}

const FOLDERS: FolderItem[] = [
  {
    id: '1', name: 'Contracts', count: 15,
    files: [
      { id: 'f1', name: 'Supplier Agreement – March 2026.pdf', type: 'pdf', size: '2.4 MB', date: 'Mar 12, 2026', folder: 'Contracts' },
      { id: 'f2', name: 'NDA – Acme Corp.pdf', type: 'pdf', size: '1.1 MB', date: 'Feb 28, 2026', folder: 'Contracts' },
      { id: 'f3', name: 'Service Contract Q1.doc', type: 'doc', size: '890 KB', date: 'Jan 15, 2026', folder: 'Contracts' },
    ],
  },
  {
    id: '2', name: 'Invoices', count: 5,
    files: [
      { id: 'f4', name: 'Invoice #1042 – March.pdf', type: 'pdf', size: '340 KB', date: 'Mar 31, 2026', folder: 'Invoices' },
      { id: 'f5', name: 'Invoice #1039 – Feb.pdf', type: 'pdf', size: '310 KB', date: 'Feb 28, 2026', folder: 'Invoices' },
    ],
  },
  {
    id: '3', name: 'Reports', count: 10,
    files: [
      { id: 'f6', name: 'Q1 2026 Financial Summary.xls', type: 'xls', size: '1.8 MB', date: 'Apr 1, 2026', folder: 'Reports' },
      { id: 'f7', name: 'Usability Testing Results.doc', type: 'doc', size: '720 KB', date: 'Mar 20, 2026', folder: 'Reports' },
    ],
  },
  {
    id: '4', name: 'Onboarding', count: 8,
    files: [
      { id: 'f8', name: 'Employee Handbook 2026.pdf', type: 'pdf', size: '4.2 MB', date: 'Jan 3, 2026', folder: 'Onboarding' },
      { id: 'f9', name: 'IT Setup Guide.doc', type: 'doc', size: '560 KB', date: 'Jan 3, 2026', folder: 'Onboarding' },
    ],
  },
];

const ALL_FILES: FileItem[] = FOLDERS.flatMap(f => f.files);

type FileColor = Record<string, string>;
const TYPE_COLOR: FileColor = { pdf: '#e54d2e', doc: '#0070f3', xls: '#1a7f3c', txt: '#737373' };
const TYPE_LABEL: FileColor = { pdf: 'PDF', doc: 'DOC', xls: 'XLS', txt: 'TXT' };

function FolderIcon({ name }: { name: string }) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div className="folder-icon">
      <div className="folder-icon__back" />
      <div className="folder-icon__body">
        <div className="folder-icon__label">{initials}</div>
      </div>
    </div>
  );
}

function FileIcon({ type }: { type: string }) {
  return (
    <div className="file-icon">
      <div className="file-icon__page">
        <div className="file-icon__fold" />
        <span className="file-icon__type" style={{ color: TYPE_COLOR[type] || '#737373' }}>
          {TYPE_LABEL[type] || type.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function DocPreviewModal({ file, onClose }: { file: FileItem; onClose: () => void }) {
  return (
    <>
      <div className="doc-modal-overlay" onClick={onClose} />
      <div className="doc-modal">
        <div className="doc-modal__header">
          <div className="doc-modal__title-row">
            <FileIcon type={file.type} />
            <div>
              <p className="text-label-md doc-modal__filename">{file.name}</p>
              <p className="text-para-xs" style={{ color: 'var(--text-soft-400)' }}>{file.size} · {file.date}</p>
            </div>
          </div>
          <button className="doc-modal__close" onClick={onClose} aria-label="Close">
            <IconClose size={18} />
          </button>
        </div>
        <div className="doc-modal__body">
          <div className="doc-modal__preview-placeholder">
            <IconFile size={40} />
            <p className="text-para-sm" style={{ color: 'var(--text-sub-600)', marginTop: 12 }}>
              Document preview will appear here.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export function LibraryPage() {
  const [openFolder, setOpenFolder] = useState<FolderItem | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [search, setSearch] = useState('');

  const sourceFiles = openFolder ? openFolder.files : ALL_FILES;
  const displayFiles = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return sourceFiles;
    return sourceFiles.filter(f => f.name.toLowerCase().includes(q));
  }, [sourceFiles, search]);

  const displayFolders = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q || openFolder) return FOLDERS;
    return FOLDERS.filter(f => f.name.toLowerCase().includes(q));
  }, [search, openFolder]);

  const handleFolderOpen = (folder: FolderItem) => {
    setOpenFolder(folder);
    setSearch('');
  };

  const handleBackToRoot = () => {
    setOpenFolder(null);
    setSearch('');
  };

  return (
    <div className="library-page">
      {/* Header row */}
      <div className="library-page__header">
        <div className="library-page__title-row">
          {/* Breadcrumb */}
          <nav className="library-breadcrumb-nav" aria-label="breadcrumb">
            <button
              className={`library-bc-item text-para-sm ${!openFolder ? 'library-bc-item--active' : ''}`}
              onClick={handleBackToRoot}
            >
              Library
            </button>
            {openFolder && (
              <>
                <span className="library-bc-sep">/</span>
                <span className="library-bc-item library-bc-item--active text-para-sm">{openFolder.name}</span>
              </>
            )}
          </nav>

          <button className="btn btn--sm btn--primary-filled library-page__upload">
            <IconUpload size={14} />
            <span>Upload</span>
          </button>
        </div>

        {/* Search bar */}
        <div className="library-search">
          <span className="library-search__icon"><IconSearch size={16} /></span>
          <input
            className="library-search__input text-para-sm"
            type="text"
            placeholder={openFolder ? `Search in ${openFolder.name}…` : 'Search files and folders…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="library-search__clear" onClick={() => setSearch('')} aria-label="Clear">
              <IconClose size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Folders section — only on root view when not filtering into files */}
      {!openFolder && (
        <section className="library-section">
          <h2 className="text-label-lg library-section__title">Folders</h2>
          {displayFolders.length === 0 ? (
            <p className="text-para-sm" style={{ color: 'var(--text-soft-400)' }}>No folders match your search.</p>
          ) : (
            <div className="library-folder-grid">
              {displayFolders.map(folder => (
                <button key={folder.id} className="folder-card" onClick={() => handleFolderOpen(folder)}>
                  <FolderIcon name={folder.name} />
                  <p className="text-label-sm folder-card__name">{folder.name}</p>
                  <p className="text-para-xs folder-card__count" style={{ color: 'var(--text-soft-400)' }}>
                    {folder.count} files
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="library-section">
        <h2 className="text-label-lg library-section__title">
          {openFolder ? 'Files' : 'Recent files'}
          {search && <span className="library-section__count text-para-xs"> · {displayFiles.length} result{displayFiles.length !== 1 ? 's' : ''}</span>}
        </h2>
        {displayFiles.length === 0 ? (
          <p className="text-para-sm" style={{ color: 'var(--text-soft-400)' }}>No files match your search.</p>
        ) : (
          <div className="library-file-grid">
            {displayFiles.map(file => (
              <button key={file.id} className="file-card" onClick={() => setPreviewFile(file)}>
                <div className="file-card__icon-wrap">
                  <FileIcon type={file.type} />
                </div>
                <p className="text-label-sm file-card__name">{file.name}</p>
                <p className="text-para-xs file-card__meta" style={{ color: 'var(--text-soft-400)' }}>
                  {file.size} · {file.date}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      {previewFile && (
        <DocPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
}
