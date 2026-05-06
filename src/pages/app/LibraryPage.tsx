import React, { useState, useMemo, useRef, useEffect } from 'react';
import { IconClose, IconFile, IconUpload, IconSearch, IconGrid, IconMenu, IconPlus } from '../../lib/icons';
import { DocumentCanvas } from '../../components/app/DocumentCanvas';

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

const INITIAL_FOLDERS: FolderItem[] = [
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

type FileColor = Record<string, string>;
const TYPE_COLOR: FileColor = { pdf: '#e54d2e', doc: '#0070f3', xls: '#1a7f3c', txt: '#737373' };
const TYPE_LABEL: FileColor = { pdf: 'PDF', doc: 'DOC', xls: 'XLS', txt: 'TXT' };

function FolderIcon({ name }: { name: string }) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div className="relative w-[80px] h-[68px] shrink-0">
      <div className="absolute top-0 left-[6px] right-0 h-[52px] bg-neutral-400 rounded-[0_10px_10px_10px] before:content-[''] before:absolute before:-top-2 before:left-0 before:w-[36px] before:h-3 before:bg-neutral-400 before:rounded-[4px_4px_0_0]" />
      <div className="absolute top-[10px] left-0 right-[6px] h-[52px] bg-neutral-500 rounded-8 flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
        <div className="text-[14px] font-bold text-white/50 tracking-[0.05em]">{initials}</div>
      </div>
    </div>
  );
}

function SmallFolderIcon() {
  return (
    <div className="relative w-8 h-8 shrink-0">
      <div className="absolute top-1 left-0 right-0 bottom-0 bg-neutral-500 rounded-[2px_6px_6px_6px] before:content-[''] before:absolute before:-top-1 before:left-0 before:w-3 before:h-2 before:bg-neutral-400 before:rounded-[2px_2px_0_0]" />
    </div>
  );
}

function FileIcon({ type }: { type: string }) {
  return (
    <div className="w-[60px] h-[72px] relative shrink-0">
      <div className="w-full h-full bg-white border-[1.5px] border-neutral-200 rounded-6 relative flex items-center justify-center shadow-sm">
        <div className="absolute top-0 right-0 w-[18px] h-[18px] bg-neutral-50 border-l-[1.5px] border-b-[1.5px] border-neutral-200 rounded-[0_6px_0_4px] before:content-[''] before:absolute before:-top-[1px] before:-right-[1px] before:w-[18px] before:h-[18px] before:bg-white before:rounded-[0_6px_0_0] before:[clip-path:polygon(0_0,100%_0,100%_100%)] before:border-t-[1.5px] before:border-r-[1.5px] before:border-neutral-200" />
        <span className="text-[10px] font-bold tracking-[0.04em] mt-2" style={{ color: TYPE_COLOR[type] || '#737373' }}>
          {TYPE_LABEL[type] || type.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function SmallFileIcon({ type }: { type: string }) {
  return (
    <div className="w-8 h-8 bg-white border border-neutral-200 rounded-4 relative flex items-center justify-center shadow-sm shrink-0">
      <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-neutral-50 border-l border-b border-neutral-200 rounded-[0_3px_0_2px]" />
      <span className="text-[6px] font-bold tracking-[0.04em] mt-1" style={{ color: TYPE_COLOR[type] || '#737373' }}>
        {TYPE_LABEL[type] || type.toUpperCase()}
      </span>
    </div>
  );
}

export function LibraryPage() {
  const [folders, setFolders] = useState<FolderItem[]>(INITIAL_FOLDERS);
  const [openFolder, setOpenFolder] = useState<FolderItem | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid'|'list'>('grid');
  const [isDragging, setIsDragging] = useState(false);
  
  // New folder creation state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('New Folder');
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // Upload modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: any; type: 'file'|'folder' } | null>(null);

  const allFiles = useMemo(() => folders.flatMap(f => f.files), [folders]);
  const sourceFiles = openFolder ? openFolder.files : allFiles;

  const displayFiles = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return sourceFiles;
    return sourceFiles.filter(f => f.name.toLowerCase().includes(q));
  }, [sourceFiles, search]);

  const displayFolders = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q || openFolder) return folders;
    return folders.filter(f => f.name.toLowerCase().includes(q));
  }, [search, openFolder, folders]);

  useEffect(() => {
    if (isCreatingFolder && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
      newFolderInputRef.current.select();
    }
  }, [isCreatingFolder]);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleCreateFolderSubmit = () => {
    if (newFolderName.trim()) {
      setFolders([...folders, { id: Date.now().toString(), name: newFolderName.trim(), count: 0, files: [] }]);
    }
    setIsCreatingFolder(false);
    setNewFolderName('New Folder');
  };

  const handleDelete = (id: string, type: 'file'|'folder') => {
    if (type === 'folder') {
      setFolders(folders.filter(f => f.id !== id));
      if (openFolder?.id === id) setOpenFolder(null);
    } else {
      setFolders(folders.map(f => ({
        ...f,
        files: f.files.filter(file => file.id !== id),
        count: f.files.filter(file => file.id !== id).length
      })));
      if (openFolder) {
        setOpenFolder({ ...openFolder, files: openFolder.files.filter(file => file.id !== id), count: openFolder.files.length - 1 });
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, item: any, type: 'file'|'folder') => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item, type });
  };

  // Drag and Drop
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); /* Handled in a real app */ };

  return (
    <div 
      className={`h-full overflow-y-auto p-[24px_24px_40px] flex flex-col gap-8 relative bg-white transition-colors duration-200 ${isDragging ? 'bg-primary-alpha-10' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,theme(colors.neutral.200)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.neutral.200)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none z-0" aria-hidden />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_110%_50%_at_50%_0%,transparent_0%,theme(colors.neutral.0)_72%)] pointer-events-none z-10" aria-hidden />

      {isDragging && (
        <div className="absolute inset-[10px] border-2 border-dashed border-primary-base rounded-20 z-50 pointer-events-none flex items-center justify-center bg-white/50 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-2 text-primary-base">
            <IconUpload size={32} />
            <span className="text-label-lg font-bold">Drop files here to upload</span>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex flex-col gap-3 relative z-20">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1.5" aria-label="breadcrumb">
            <button
              className={`bg-transparent border-none cursor-pointer font-sans p-0 transition-colors duration-200 text-para-sm ${!openFolder ? 'text-neutral-950 font-medium cursor-default hover:text-neutral-950' : 'text-neutral-400 hover:text-neutral-950'}`}
              onClick={() => { setOpenFolder(null); setSearch(''); }}
            >
              Library
            </button>
            {openFolder && (
              <>
                <span className="text-neutral-400 select-none">/</span>
                <span className="text-neutral-950 font-medium text-para-sm">{openFolder.name}</span>
              </>
            )}
          </nav>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-neutral-100 rounded-8 p-0.5">
              <button 
                className={`p-1.5 rounded-6 border-none cursor-pointer transition-colors flex items-center justify-center ${viewMode === 'list' ? 'bg-white shadow-sm text-neutral-950' : 'bg-transparent text-neutral-400 hover:text-neutral-600'}`}
                onClick={() => setViewMode('list')}
                title="List view"
              >
                <IconMenu size={16} />
              </button>
              <button 
                className={`p-1.5 rounded-6 border-none cursor-pointer transition-colors flex items-center justify-center ${viewMode === 'grid' ? 'bg-white shadow-sm text-neutral-950' : 'bg-transparent text-neutral-400 hover:text-neutral-600'}`}
                onClick={() => setViewMode('grid')}
                title="Grid view"
              >
                <IconGrid size={16} />
              </button>
            </div>
            {!openFolder && (
              <button className="inline-flex items-center justify-center gap-2 h-8 px-3 rounded-8 font-medium font-sans text-xs transition-colors bg-white border border-neutral-200 text-neutral-950 shadow-sm hover:bg-neutral-50" onClick={() => setIsCreatingFolder(true)}>
                <IconPlus size={14} />
                <span>New Folder</span>
              </button>
            )}
            <button 
              className="inline-flex items-center justify-center gap-2 h-8 px-3 rounded-8 font-medium font-sans text-xs transition-colors bg-primary-base text-white hover:bg-primary-darker"
              onClick={() => setIsUploadModalOpen(true)}
            >
              <IconUpload size={14} />
              <span>Upload</span>
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative flex items-center">
          <span className="absolute left-3 text-neutral-400 flex items-center pointer-events-none"><IconSearch size={16} /></span>
          <input
            className="w-full max-w-[360px] h-9 pl-9 pr-9 bg-white border border-neutral-200 rounded-10 font-sans text-neutral-950 outline-none transition-all duration-200 placeholder:text-neutral-400 focus:border-neutral-300 focus:shadow-[0_0_0_3px_theme(colors.primary.alpha-10)] text-para-sm"
            type="text"
            placeholder={openFolder ? `Search in ${openFolder.name}…` : 'Search files and folders…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Folders section */}
      {!openFolder && (
        <section className="flex flex-col gap-4 relative z-20">
          <h2 className="text-label-lg text-neutral-950">Folders</h2>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 max-md:grid-cols-[repeat(auto-fill,minmax(130px,1fr))]">
              {isCreatingFolder && (
                <div className="flex flex-col items-center gap-2 p-[16px_12px] bg-neutral-50 border border-neutral-200 border-dashed rounded-12 text-center">
                  <FolderIcon name="NW" />
                  <input 
                    ref={newFolderInputRef}
                    className="w-full text-center bg-white border border-primary-base rounded-4 outline-none text-label-sm px-1 py-0.5 mt-[2px]"
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onBlur={handleCreateFolderSubmit}
                    onKeyDown={e => e.key === 'Enter' && handleCreateFolderSubmit()}
                  />
                  <p className="text-para-xs text-neutral-400 mt-0">0 files</p>
                </div>
              )}
              {displayFolders.map(folder => (
                <button 
                  key={folder.id} 
                  className="group flex flex-col items-center gap-2 p-[16px_12px] bg-transparent border-none cursor-pointer font-sans rounded-12 transition-colors duration-200 text-center hover:bg-neutral-50 relative" 
                  onClick={() => { setOpenFolder(folder); setSearch(''); }}
                  onContextMenu={(e) => handleContextMenu(e, folder, 'folder')}
                >
                  <FolderIcon name={folder.name} />
                  <p className="text-label-sm text-neutral-950 mt-[2px] truncate w-full px-2">{folder.name}</p>
                  <p className="text-para-xs text-neutral-400 mt-0">{folder.count} files</p>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div 
                      className="p-1 rounded-6 bg-white shadow-sm border border-neutral-200 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-50"
                      onClick={(e) => { e.stopPropagation(); handleContextMenu(e, folder, 'folder'); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col border border-neutral-200 rounded-12 overflow-hidden bg-white">
              {isCreatingFolder && (
                <div className="flex items-center gap-4 p-[12px_16px] border-b border-neutral-200 bg-neutral-50">
                  <SmallFolderIcon />
                  <input 
                    ref={newFolderInputRef}
                    className="flex-1 bg-white border border-primary-base rounded-6 outline-none text-label-sm px-2 py-1"
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onBlur={handleCreateFolderSubmit}
                    onKeyDown={e => e.key === 'Enter' && handleCreateFolderSubmit()}
                  />
                  <span className="text-para-xs text-neutral-400 w-24">0 files</span>
                </div>
              )}
              {displayFolders.map(folder => (
                <div 
                  key={folder.id} 
                  className="group flex items-center gap-4 p-[12px_16px] border-b border-neutral-200 last:border-0 hover:bg-neutral-50 cursor-pointer transition-colors relative"
                  onClick={() => { setOpenFolder(folder); setSearch(''); }}
                  onContextMenu={(e) => handleContextMenu(e, folder, 'folder')}
                >
                  <SmallFolderIcon />
                  <span className="text-label-sm text-neutral-950 flex-1 truncate">{folder.name}</span>
                  <span className="text-para-xs text-neutral-400 w-24">{folder.count} files</span>
                  <button 
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-6 bg-white shadow-sm border border-neutral-200 text-neutral-600 hover:text-neutral-950 transition-all"
                    onClick={(e) => { e.stopPropagation(); handleContextMenu(e, folder, 'folder'); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Files section */}
      <section className="flex flex-col gap-4 relative z-20">
        <h2 className="text-label-lg text-neutral-950">
          {openFolder ? 'Files' : 'Recent files'}
          {search && <span className="text-neutral-400 text-para-xs"> · {displayFiles.length} result{displayFiles.length !== 1 ? 's' : ''}</span>}
        </h2>
        {displayFiles.length === 0 ? (
          <p className="text-para-sm text-neutral-400">No files match your search.</p>
        ) : (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
              {displayFiles.map(file => (
                <button 
                  key={file.id} 
                  className="group flex flex-col items-center gap-2 p-[16px_12px] bg-transparent border-none cursor-pointer font-sans rounded-12 transition-colors duration-200 text-center hover:bg-neutral-50 relative" 
                  onClick={() => setPreviewFile(file)}
                  onContextMenu={(e) => handleContextMenu(e, file, 'file')}
                >
                  <div className="flex items-center justify-center">
                    <FileIcon type={file.type} />
                  </div>
                  <p className="text-label-sm text-neutral-950 text-[12px] break-words leading-[1.4] max-w-[120px] line-clamp-2">{file.name}</p>
                  <p className="text-[11px] text-neutral-400">{file.size} · {file.date}</p>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div 
                      className="p-1 rounded-6 bg-white shadow-sm border border-neutral-200 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-50"
                      onClick={(e) => { e.stopPropagation(); handleContextMenu(e, file, 'file'); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col border border-neutral-200 rounded-12 overflow-hidden bg-white">
              {displayFiles.map(file => (
                <div 
                  key={file.id} 
                  className="group flex items-center gap-4 p-[12px_16px] border-b border-neutral-200 last:border-0 hover:bg-neutral-50 cursor-pointer transition-colors relative"
                  onClick={() => setPreviewFile(file)}
                  onContextMenu={(e) => handleContextMenu(e, file, 'file')}
                >
                  <SmallFileIcon type={file.type} />
                  <span className="text-label-sm text-neutral-950 flex-1 truncate">{file.name}</span>
                  <span className="text-para-xs text-neutral-400 w-24 hidden md:block">{file.size}</span>
                  <span className="text-para-xs text-neutral-400 w-24 hidden md:block">{file.date}</span>
                  <button 
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-6 bg-white shadow-sm border border-neutral-200 text-neutral-600 hover:text-neutral-950 transition-all"
                    onClick={(e) => { e.stopPropagation(); handleContextMenu(e, file, 'file'); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </section>

      {/* Context Menu overlay */}
      {contextMenu && (
        <div className="fixed inset-0 z-[300]" onClick={() => setContextMenu(null)}>
          <div 
            className="absolute bg-white rounded-12 shadow-[0_0_0_1px_theme(colors.neutral.200),theme(boxShadow.xl)] p-1 min-w-[160px] animate-[fadeUp_0.15s_ease]"
            style={{ top: Math.min(contextMenu.y, window.innerHeight - 150), left: Math.min(contextMenu.x, window.innerWidth - 180) }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-subheading-sm text-neutral-400 px-2 pt-2 pb-1 truncate max-w-[140px]">{contextMenu.item.name}</p>
            <button className="flex items-center w-full p-[8px_10px] text-left text-para-sm text-neutral-950 bg-transparent border-none rounded-8 cursor-pointer hover:bg-neutral-50" onClick={() => setContextMenu(null)}>
              Rename
            </button>
            <button className="flex items-center w-full p-[8px_10px] text-left text-para-sm text-neutral-950 bg-transparent border-none rounded-8 cursor-pointer hover:bg-neutral-50" onClick={() => setContextMenu(null)}>
              Move to...
            </button>
            <div className="h-px bg-neutral-200 my-1" />
            <button 
              className="flex items-center w-full p-[8px_10px] text-left text-para-sm text-error-base bg-transparent border-none rounded-8 cursor-pointer hover:bg-red-500/10" 
              onClick={() => { handleDelete(contextMenu.item.id, contextMenu.type); setContextMenu(null); }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {previewFile && (
        <>
          <div className="fixed inset-0 bg-black/30 z-[200] animate-[fadeIn_0.2s_ease]" onClick={() => setPreviewFile(null)} />
          <div className="fixed top-0 right-0 bottom-0 w-[min(100vw,800px)] bg-white z-[201] shadow-[-4px_0_24px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden animate-[slideInRight_0.28s_cubic-bezier(0.32,0.72,0,1)]">
            <DocumentCanvas file={previewFile} onClose={() => setPreviewFile(null)} className="w-full h-full" />
          </div>
        </>
      )}

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-[fadeIn_0.2s_ease]" onClick={() => setIsUploadModalOpen(false)} />
          <div className="relative bg-white rounded-20 shadow-xl w-full max-w-[500px] flex flex-col overflow-hidden animate-[fadeUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="flex items-center justify-between p-5 border-b border-neutral-200">
              <h2 className="text-h6 text-neutral-950">Upload files</h2>
              <button className="p-1 text-neutral-400 hover:text-neutral-950 transition-colors bg-transparent border-none rounded-6" onClick={() => setIsUploadModalOpen(false)}>
                <IconClose size={20} />
              </button>
            </div>
            <div className="p-6 flex flex-col gap-5">
              <div className="border-2 border-dashed border-neutral-200 rounded-16 p-10 flex flex-col items-center justify-center gap-3 text-center transition-colors hover:border-primary-base hover:bg-primary-alpha-10 group cursor-pointer">
                <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 group-hover:bg-white group-hover:text-primary-base transition-colors shadow-sm">
                  <IconUpload size={24} />
                </div>
                <div>
                  <p className="text-label-md text-neutral-950"><span className="text-primary-base">Click to browse</span> or drag and drop</p>
                  <p className="text-para-sm text-neutral-500 mt-1">PDF, DOC, XLS, CSV (max. 50MB)</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="h-px bg-neutral-200 flex-1" />
                <span className="text-para-xs text-neutral-400 uppercase font-medium tracking-wider">Or</span>
                <div className="h-px bg-neutral-200 flex-1" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button className="flex items-center justify-center gap-2 p-3 bg-white border border-neutral-200 rounded-10 text-label-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                  <IconFile size={16} /> Import from Drive
                </button>
                <button className="flex items-center justify-center gap-2 p-3 bg-white border border-neutral-200 rounded-10 text-label-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                  <IconFile size={16} /> Add via URL
                </button>
              </div>
            </div>
            <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex justify-end gap-3">
              <button className="px-4 py-2 text-label-sm text-neutral-600 bg-white border border-neutral-200 rounded-8 hover:bg-neutral-50 transition-colors" onClick={() => setIsUploadModalOpen(false)}>Cancel</button>
              <button className="px-4 py-2 text-label-sm text-white bg-primary-base border-none rounded-8 hover:bg-primary-darker transition-colors">Upload</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
