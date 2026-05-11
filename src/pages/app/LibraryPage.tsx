import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconClose, IconFile, IconUpload, IconSearch, IconGrid, IconMenu, IconPlus, IconArrowUp, IconSparkles, IconAttach, IconDocFile, IconZap, IconChevronDown, IconFolderSimple, IconCheck, IconLock, IconArrowRight } from '../../lib/icons';
import { IconGoogleDrive, IconDropbox, IconOneDrive, IconBox } from '../../components/ui/BrandIcons';
import { DocumentCanvas } from '../../components/app/DocumentCanvas';
import { Button } from '../../components/ui/Button';

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
  const navigate = useNavigate();
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
  const [uploadSource, setUploadSource] = useState<'local' | 'drive' | 'dropbox' | 'onedrive' | 'box' | 'url' | 'api'>('local');
  const [isConnected, setIsConnected] = useState<Record<string, boolean>>({ drive: false, dropbox: false, onedrive: false, box: false });
  const [isConnecting, setIsConnecting] = useState(false);
  const [cloudSearch, setCloudSearch] = useState('');
  const [selectedCloudFiles, setSelectedCloudFiles] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  // Mock cloud data
  const CLOUD_FILES = useMemo(() => [
    { id: 'c1', name: 'Legal Documents', type: 'folder', items: [
      { id: 'c1-1', name: 'Employment_Agreement_Template.pdf', type: 'pdf', size: '1.2 MB' },
      { id: 'c1-2', name: 'Standard_Terms_v2.doc', type: 'doc', size: '840 KB' },
    ]},
    { id: 'c2', name: 'Case 2026-X4', type: 'folder', items: [
      { id: 'c2-1', name: 'Evidence_Photos.zip', type: 'zip', size: '45 MB' },
      { id: 'c2-2', name: 'Witness_Statement_01.pdf', type: 'pdf', size: '2.1 MB' },
      { id: 'c2-3', name: 'Witness_Statement_02.pdf', type: 'pdf', size: '1.8 MB' },
    ]},
    { id: 'c3', name: 'Retainer_Agreement.pdf', type: 'pdf', size: '450 KB' },
    { id: 'c4', name: 'Client_Onboarding.xls', type: 'xls', size: '1.1 MB' },
  ], []);

  const handleConnect = (provider: string) => {
    setIsConnecting(true);
    setTimeout(() => {
      setIsConnected(prev => ({ ...prev, [provider]: true }));
      setIsConnecting(false);
    }, 1500);
  };

  const toggleCloudFile = (id: string) => {
    const newSelected = new Set(selectedCloudFiles);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedCloudFiles(newSelected);
  };

  const handleImport = () => {
    setIsImporting(true);
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        setImportProgress(100);
        clearInterval(interval);
        setTimeout(() => {
          setIsImporting(false);
          setIsUploadModalOpen(false);
          setImportProgress(0);
          setSelectedCloudFiles(new Set());
          // In a real app, we'd add the files to the library state here
        }, 800);
      }
      setImportProgress(progress);
    }, 200);
  };

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: any; type: 'file'|'folder' } | null>(null);

  // Floating chat input state
  const [chatInput, setChatInput] = useState('');
  const [quotedFiles, setQuotedFiles] = useState<FileItem[]>([]);
  const [chatDropActive, setChatDropActive] = useState(false);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChatInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = 'auto';
      chatTextareaRef.current.style.height = `${Math.min(chatTextareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleChatSubmit = () => {
    const trimmed = chatInput.trim();
    if (!trimmed && quotedFiles.length === 0) return;
    // Build the initial message with mentions
    const mentions = quotedFiles.map(f => `@${f.name}`).join(' ');
    const fullMessage = mentions ? `${mentions} ${trimmed}` : trimmed;
    navigate('/app/chat', { state: { initialMessage: fullMessage, quotedFiles: quotedFiles.map(f => ({ id: f.id, name: f.name, type: f.type })) } });
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit();
    }
  };

  const removeQuotedFile = (id: string) => {
    setQuotedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleFileDragStart = (e: React.DragEvent, file: FileItem) => {
    e.dataTransfer.setData('application/json', JSON.stringify(file));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleChatDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setChatDropActive(true);
  };

  const handleChatDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setChatDropActive(false);
  };

  const handleChatDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setChatDropActive(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data && data.id && data.name) {
        setQuotedFiles(prev => prev.some(f => f.id === data.id) ? prev : [...prev, data]);
        chatTextareaRef.current?.focus();
      }
    } catch { /* ignore non-file drops */ }
  };

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
    <div className="h-full flex flex-col relative bg-white">
    <div 
      className={`flex-1 overflow-y-auto p-[24px_24px_24px] flex flex-col gap-8 relative transition-colors duration-200 ${isDragging ? 'bg-primary-alpha-10' : ''}`}
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
                  draggable
                  onDragStart={(e) => handleFileDragStart(e, file)}
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
                  draggable
                  onDragStart={(e) => handleFileDragStart(e, file)}
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
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease]" onClick={() => setIsUploadModalOpen(false)} />
          <div className="relative bg-white rounded-20 shadow-2xl w-full max-w-[840px] h-[min(640px,90vh)] flex overflow-hidden animate-[fadeUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
            
            {/* Sidebar */}
            <div className="w-[200px] bg-neutral-50 border-r border-neutral-200 flex flex-col p-4 gap-6 shrink-0">
              <div className="flex flex-col gap-1">
                <h3 className="text-para-xs font-bold text-neutral-400 uppercase tracking-wider px-2">Sources</h3>
                <div className="flex flex-col gap-0.5 mt-2">
                  <button 
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-10 text-label-sm transition-all ${uploadSource === 'local' ? 'bg-white shadow-sm text-primary-base font-bold' : 'text-neutral-600 hover:bg-neutral-200/50'}`}
                    onClick={() => setUploadSource('local')}
                  >
                    <IconUpload size={16} /> My Device
                  </button>
                  <button 
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-10 text-label-sm transition-all ${uploadSource === 'drive' ? 'bg-white shadow-sm text-primary-base font-bold' : 'text-neutral-600 hover:bg-neutral-200/50'}`}
                    onClick={() => setUploadSource('drive')}
                  >
                    <IconGoogleDrive size={16} /> Google Drive
                  </button>
                  <button 
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-10 text-label-sm transition-all ${uploadSource === 'dropbox' ? 'bg-white shadow-sm text-primary-base font-bold' : 'text-neutral-600 hover:bg-neutral-200/50'}`}
                    onClick={() => setUploadSource('dropbox')}
                  >
                    <IconDropbox size={16} /> Dropbox
                  </button>
                  <button 
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-10 text-label-sm transition-all ${uploadSource === 'onedrive' ? 'bg-white shadow-sm text-primary-base font-bold' : 'text-neutral-600 hover:bg-neutral-200/50'}`}
                    onClick={() => setUploadSource('onedrive')}
                  >
                    <IconOneDrive size={16} /> OneDrive
                  </button>
                  <button 
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-10 text-label-sm transition-all ${uploadSource === 'box' ? 'bg-white shadow-sm text-primary-base font-bold' : 'text-neutral-600 hover:bg-neutral-200/50'}`}
                    onClick={() => setUploadSource('box')}
                  >
                    <IconBox size={16} /> Box
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1 mt-auto">
                <button 
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-10 text-label-sm transition-all ${uploadSource === 'url' ? 'bg-white shadow-sm text-primary-base font-bold' : 'text-neutral-600 hover:bg-neutral-200/50'}`}
                  onClick={() => setUploadSource('url')}
                >
                  <IconAttach size={16} /> Import via URL
                </button>
                <button 
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-10 text-label-sm transition-all ${uploadSource === 'api' ? 'bg-white shadow-sm text-primary-base font-bold' : 'text-neutral-600 hover:bg-neutral-200/50'}`}
                  onClick={() => setUploadSource('api')}
                >
                  <IconZap size={16} /> API Integration
                </button>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-white">
              <div className="flex items-center justify-between p-5 border-b border-neutral-100">
                <div className="flex items-center gap-3">
                  <h2 className="text-h6 text-neutral-950 font-bold capitalize">
                    {uploadSource === 'local' ? 'Upload files' : uploadSource === 'api' ? 'API Integrations' : `${uploadSource} Import`}
                  </h2>
                  {uploadSource !== 'local' && uploadSource !== 'url' && uploadSource !== 'api' && isConnected[uploadSource] && (
                    <span className="px-2 py-0.5 bg-green-50 text-[10px] text-green-600 font-bold rounded-full border border-green-100">CONNECTED</span>
                  )}
                </div>
                <button className="p-1 text-neutral-400 hover:text-neutral-950 transition-colors bg-transparent border-none rounded-8 hover:bg-neutral-100" onClick={() => setIsUploadModalOpen(false)}>
                  <IconClose size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 flex flex-col">
                {uploadSource === 'local' ? (
                  /* Local Upload View */
                  <div className="flex flex-col gap-6">
                    <div className="border-2 border-dashed border-neutral-200 rounded-20 p-12 flex flex-col items-center justify-center gap-4 text-center transition-all hover:border-primary-base hover:bg-primary-alpha-5 group cursor-pointer">
                      <div className="w-16 h-16 rounded-20 bg-neutral-50 flex items-center justify-center text-neutral-400 group-hover:bg-white group-hover:text-primary-base transition-all shadow-sm group-hover:shadow-md group-hover:-translate-y-1">
                        <IconUpload size={32} />
                      </div>
                      <div>
                        <p className="text-label-lg text-neutral-950 font-bold"><span className="text-primary-base">Click to browse</span> or drag and drop</p>
                        <p className="text-para-sm text-neutral-500 mt-1">PDF, DOC, XLS, CSV up to 50MB per file</p>
                      </div>
                    </div>
                  </div>
                ) : uploadSource === 'url' ? (
                  /* URL Import View */
                  <div className="flex flex-col gap-4 max-w-[480px] mx-auto w-full pt-12">
                    <div className="w-16 h-16 rounded-20 bg-primary-alpha-10 flex items-center justify-center text-primary-base mb-2 mx-auto">
                      <IconAttach size={32} />
                    </div>
                    <div className="text-center mb-6">
                      <h3 className="text-h6 text-neutral-950 font-bold">Import from Web</h3>
                      <p className="text-para-sm text-neutral-500 mt-1">Paste a direct link to a PDF or document.</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-label-sm text-neutral-700 font-medium">Document URL</label>
                      <input 
                        className="w-full h-11 px-4 bg-neutral-50 border border-neutral-200 rounded-12 outline-none focus:border-primary-base focus:bg-white transition-all text-para-sm"
                        placeholder="https://example.com/document.pdf"
                      />
                    </div>
                    <Button className="mt-4">Fetch Document</Button>
                  </div>
                ) : uploadSource === 'api' ? (
                  /* API Integration View */
                  <div className="flex flex-col gap-4 max-w-[480px] mx-auto w-full pt-12">
                    <div className="w-16 h-16 rounded-20 bg-primary-alpha-10 flex items-center justify-center text-primary-base mb-2 mx-auto">
                      <IconZap size={32} />
                    </div>
                    <div className="text-center mb-6">
                      <h3 className="text-h6 text-neutral-950 font-bold">Secure API Access</h3>
                      <p className="text-para-sm text-neutral-500 mt-1">
                        Build custom integrations using our secure API. Generate keys to get started.
                      </p>
                    </div>
                    <Button 
                      variant="primary"
                      size="sm"
                      className="mt-4"
                    >
                      Generate API Key
                    </Button>
                  </div>
                ) : (
                  /* Cloud Provider View */
                  <div className="h-full flex flex-col">
                    {!isConnected[uploadSource] ? (
                      /* Not Connected View */
                      <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 animate-[fadeIn_0.3s_ease]">
                        <div className="relative">
                          <div className="w-20 h-20 rounded-24 bg-neutral-50 flex items-center justify-center shadow-inner">
                            {uploadSource === 'drive' && <IconGoogleDrive size={40} />}
                            {uploadSource === 'dropbox' && <IconDropbox size={40} />}
                            {uploadSource === 'onedrive' && <IconOneDrive size={40} />}
                            {uploadSource === 'box' && <IconBox size={40} />}
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-md border border-neutral-100">
                            <IconLock size={14} className="text-neutral-400" />
                          </div>
                        </div>
                        <div className="max-w-[320px]">
                          <h3 className="text-h6 text-neutral-950 font-bold">Connect your {uploadSource}</h3>
                          <p className="text-para-sm text-neutral-500 mt-2 leading-relaxed">
                            Access your {uploadSource} folders and import documents directly into your library.
                          </p>
                        </div>
                        <Button 
                          variant="primary"
                          onClick={() => handleConnect(uploadSource)}
                          loading={isConnecting}
                          rightIcon={<IconArrowRight size={14} />}
                        >
                          Link {uploadSource} Account
                        </Button>
                      </div>
                    ) : (
                      /* Connected Browser View */
                      <div className="flex-1 flex flex-col min-h-0 animate-[fadeIn_0.3s_ease]">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"><IconSearch size={16} /></span>
                            <input 
                              className="w-full h-10 pl-10 pr-4 bg-neutral-50 border border-neutral-200 rounded-10 outline-none focus:border-primary-base focus:bg-white transition-all text-para-sm"
                              placeholder={`Search in ${uploadSource}...`}
                              value={cloudSearch}
                              onChange={e => setCloudSearch(e.target.value)}
                            />
                          </div>
                          <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-8">
                            <button className="p-1.5 bg-white shadow-xs rounded-6 text-neutral-950"><IconGrid size={14} /></button>
                            <button className="p-1.5 text-neutral-400 hover:text-neutral-600"><IconMenu size={14} /></button>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-1">
                          {CLOUD_FILES.filter(f => f.name.toLowerCase().includes(cloudSearch.toLowerCase())).map(item => (
                            <div key={item.id} className="flex flex-col">
                              <div 
                                className={`group flex items-center gap-3 p-2.5 rounded-10 transition-colors cursor-pointer ${selectedCloudFiles.has(item.id) ? 'bg-primary-alpha-5' : 'hover:bg-neutral-50'}`}
                                onClick={() => toggleCloudFile(item.id)}
                              >
                                <div className={`w-5 h-5 rounded-6 border flex items-center justify-center transition-all ${selectedCloudFiles.has(item.id) ? 'bg-primary-base border-primary-base text-white' : 'border-neutral-300 bg-white group-hover:border-neutral-400'}`}>
                                  {selectedCloudFiles.has(item.id) && <IconCheck size={12} />}
                                </div>
                                {item.type === 'folder' ? (
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <IconFolderSimple size={18} className="text-neutral-500 shrink-0" />
                                    <span className="text-label-sm text-neutral-950 font-bold truncate">{item.name}</span>
                                    <IconChevronDown size={14} className="text-neutral-400 ml-auto" />
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <IconFile size={18} className="text-neutral-400 shrink-0" />
                                    <span className="text-label-sm text-neutral-950 truncate">{item.name}</span>
                                    <span className="text-para-xs text-neutral-400 ml-auto whitespace-nowrap">{item.size}</span>
                                  </div>
                                )}
                              </div>
                              
                              {item.type === 'folder' && item.items && (
                                <div className="ml-8 mt-0.5 mb-1 flex flex-col gap-0.5 border-l border-neutral-100">
                                  {item.items.map(subItem => (
                                    <div 
                                      key={subItem.id} 
                                      className={`group flex items-center gap-3 p-2 rounded-8 transition-colors cursor-pointer ml-3 ${selectedCloudFiles.has(subItem.id) ? 'bg-primary-alpha-5' : 'hover:bg-neutral-50'}`}
                                      onClick={(e) => { e.stopPropagation(); toggleCloudFile(subItem.id); }}
                                    >
                                      <div className={`w-4 h-4 rounded-4 border flex items-center justify-center transition-all ${selectedCloudFiles.has(subItem.id) ? 'bg-primary-base border-primary-base text-white' : 'border-neutral-300 bg-white group-hover:border-neutral-400'}`}>
                                        {selectedCloudFiles.has(subItem.id) && <IconCheck size={10} />}
                                      </div>
                                      <IconDocFile size={16} className="text-neutral-400 shrink-0" />
                                      <span className="text-para-sm text-neutral-700 truncate">{subItem.name}</span>
                                      <span className="text-para-xs text-neutral-400 ml-auto whitespace-nowrap">{subItem.size}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-neutral-100 bg-neutral-50/50 flex flex-col gap-3">
                {isImporting && (
                  <div className="flex flex-col gap-2 animate-[fadeUp_0.2s_ease]">
                    <div className="flex items-center justify-between">
                      <span className="text-para-xs font-bold text-primary-base">Importing {selectedCloudFiles.size} files...</span>
                      <span className="text-para-xs font-bold text-neutral-950">{Math.round(importProgress)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-neutral-200 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-base transition-all duration-300 ease-out" style={{ width: `${importProgress}%` }} />
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {uploadSource !== 'local' && isConnected[uploadSource] && (
                      <button className="text-para-xs text-neutral-400 hover:text-error-base transition-colors font-medium underline underline-offset-2" onClick={() => setIsConnected(prev => ({ ...prev, [uploadSource]: false }))}>
                        Disconnect account
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button 
                      variant="neutral" 
                      mode="stroke"
                      size="sm"
                      onClick={() => setIsUploadModalOpen(false)}
                      disabled={isImporting}
                    >
                      Cancel
                    </Button>
                    <Button 
                      variant="primary"
                      size="sm"
                      disabled={(uploadSource !== 'local' && selectedCloudFiles.size === 0)}
                      loading={isImporting}
                      onClick={uploadSource === 'local' ? undefined : handleImport}
                    >
                      {selectedCloudFiles.size > 0 ? `Import ${selectedCloudFiles.size} files` : 'Upload'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* End of scrollable content */}
      </div>

      {/* Chat Input pinned to bottom */}
      <div 
        className="shrink-0 flex flex-col items-center px-4 pt-3 pb-4 bg-white border-t border-neutral-100 z-[100]"
        onDragOver={handleChatDragOver}
        onDragLeave={handleChatDragLeave}
        onDrop={handleChatDrop}
      >
        <div className="w-full max-w-[720px] mx-auto relative flex flex-col">

          <div className={`w-full bg-neutral-50 rounded-[20px] p-[6px_6px_8px] flex flex-col gap-1.5 shadow-[0_0_0_1px_theme(colors.neutral.200),theme(boxShadow.lg)] transition-all duration-200 focus-within:shadow-[0_0_0_1.5px_theme(colors.neutral.300),theme(boxShadow.lg)] ${chatDropActive ? 'ring-2 ring-primary-base' : ''}`}>

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
                  ref={chatTextareaRef}
                  className="flex-1 border-none outline-none resize-none bg-transparent font-sans text-neutral-950 leading-[1.6] min-h-[60px] max-h-[200px] overflow-y-auto p-[8px_16px] placeholder:text-neutral-400 text-para-md"
                  placeholder={chatDropActive ? 'Drop a file here to quote it...' : 'Describe your legal issue...'}
                  value={chatInput}
                  onChange={handleChatInputChange}
                  onKeyDown={handleChatKeyDown}
                  rows={2}
                />
                <div className="flex items-center justify-between p-[8px_12px_12px_12px]">
                  <div className="flex items-center gap-1">
                    <button className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 hover:text-neutral-600 hover:bg-neutral-200" aria-label="Attach">
                      <IconAttach size={17} />
                    </button>
                    {quotedFiles.map(f => (
                      <span key={f.id} className="inline-flex items-center gap-[5px] px-[8px] py-[3px] bg-white border border-neutral-200 rounded-full text-[11px] font-medium text-neutral-600 whitespace-nowrap max-w-[180px] overflow-hidden animate-[fadeUp_0.15s_ease]">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TYPE_COLOR[f.type] || '#737373' }} />
                        <IconDocFile size={12} />
                        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{f.name}</span>
                        <button className="ml-0.5 p-0.5 rounded-full hover:bg-neutral-200 transition-colors bg-transparent border-none cursor-pointer text-neutral-400 hover:text-neutral-700 flex items-center justify-center" onClick={() => removeQuotedFile(f.id)}>
                          <IconClose size={8} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <button
                    className={`flex items-center justify-center w-8 h-8 border-none rounded-8 cursor-pointer transition-all duration-200 ${chatInput.trim() || quotedFiles.length > 0 ? 'bg-primary-base text-white hover:bg-primary-darker hover:scale-105' : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'}`}
                    onClick={handleChatSubmit}
                    disabled={!chatInput.trim() && quotedFiles.length === 0}
                    aria-label="Send"
                  >
                    <IconArrowUp size={16} />
                  </button>
                </div>
              </div>
          </div>
        </div>
        <p className="text-[11px] text-neutral-400 text-center max-w-[700px] leading-[1.6] mt-3 mb-0">
          Script AI only provides insights based on your uploaded documents.
        </p>
      </div>
    </div>
  );
}
