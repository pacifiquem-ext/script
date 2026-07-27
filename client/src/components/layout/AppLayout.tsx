import React, { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  IconPlus,
  IconChat,
  IconLibrary,
  IconSearch,
  IconClose,
  IconSidebar,
  IconSettings,
  IconLogout,
  IconChevronDown,
  IconEdit,
  IconDelete,
} from '../../lib/icons';
import { SettingsModal } from '../../pages/app/SettingsModal';
import { useAuth } from '../../contexts/useAuth';
import {
  initials,
  useCreateWorkspace,
  useSwitchWorkspace,
  useWorkspaces,
} from '../../lib/workspaces';
import { useChatMutations, useConversations } from '../../lib/chat-api';
import type { PublicConversation } from '@script/shared';
import { Alert } from '../ui/Alert';
import { CompactButton } from '../ui/CompactButton';
import { ConfirmModal } from '../ui/ConfirmModal';
import { FormModal } from '../ui/FormModal';
import { notify } from '../ui/toast-alert';
import { getErrorMessage } from '../../lib/form-errors';
import { LoadingState } from '../ui/LoadingState';
import { EmptyState } from '../ui/EmptyState';
import { ResizeHandle } from '../ui/ResizeHandle';
import { useResizableWidth } from '../../lib/use-resizable-width';

export function AppLayout() {
  const [expanded, setExpanded] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const { user, logout } = useAuth();
  const workspacesQuery = useWorkspaces(Boolean(user));
  const switchWorkspace = useSwitchWorkspace();
  const createWorkspace = useCreateWorkspace();
  const workspaces = workspacesQuery.data ?? [];
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === user?.lastWorkspaceId) ?? workspaces[0] ?? null;
  const displayName = user?.name ?? 'Account';
  const displayEmail = user?.email ?? '';
  const userInitials = initials(displayName);
  const conversationsQuery = useConversations(Boolean(user), searchMode ? searchQuery : undefined);
  const { createConversation, renameConversation, deleteConversation } = useChatMutations();
  const conversationGroups = conversationsQuery.data?.groups ?? [];
  const profileRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const activeConversationId = (location.state as { conversationId?: string } | null)
    ?.conversationId;
  const [renameTarget, setRenameTarget] = useState<PublicConversation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicConversation | null>(null);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [modalBusy, setModalBusy] = useState(false);
  const sidebarPanel = useResizableWidth({
    storageKey: 'script.sidebarWidth',
    defaultWidth: 260,
    minWidth: 200,
    maxWidth: 400,
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (workspaceRef.current && !workspaceRef.current.contains(e.target as Node)) {
        setWorkspaceOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (searchMode) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [searchMode]);

  const isActive = (href: string) => location.pathname.startsWith(href);
  const searchResults =
    searchMode && searchQuery.trim() ? (conversationsQuery.data?.conversations ?? []) : null;

  async function submitRename(title: string) {
    if (!renameTarget) return;
    setModalBusy(true);
    try {
      await renameConversation.mutateAsync({ id: renameTarget.id, title });
      notify.success('Chat renamed');
      setRenameTarget(null);
    } catch (err) {
      notify.error(getErrorMessage(err, 'Could not rename chat.'));
    } finally {
      setModalBusy(false);
    }
  }

  async function submitDelete() {
    if (!deleteTarget) return;
    setModalBusy(true);
    try {
      const id = deleteTarget.id;
      await deleteConversation.mutateAsync(id);
      notify.success('Chat deleted');
      setDeleteTarget(null);
      if (activeConversationId === id) {
        navigate('/app/chat', { replace: true, state: {} });
      }
    } catch (err) {
      notify.error(getErrorMessage(err, 'Could not delete chat.'));
    } finally {
      setModalBusy(false);
    }
  }

  async function submitWorkspace(name: string) {
    setModalBusy(true);
    try {
      await createWorkspace.mutateAsync(name);
      notify.success('Workspace created');
      setWorkspaceModalOpen(false);
      setWorkspaceOpen(false);
    } catch (err) {
      notify.error(getErrorMessage(err, 'Could not create workspace.'));
    } finally {
      setModalBusy(false);
    }
  }

  function renderConversationRow(item: PublicConversation) {
    const active = activeConversationId === item.id && isActive('/app/chat');
    return (
      <div
        key={item.id}
        className={`group flex items-center gap-0.5 rounded-8 pr-1 ${active ? 'bg-neutral-200' : 'hover:bg-neutral-50'}`}
      >
        <button
          type="button"
          className={`flex-1 min-w-0 text-left p-[7px_8px] bg-transparent border-none cursor-pointer rounded-8 transition-colors overflow-hidden text-ellipsis whitespace-nowrap text-para-sm ${active ? 'text-neutral-950' : 'text-neutral-600 hover:text-neutral-950'}`}
          onClick={() => navigate('/app/chat', { state: { conversationId: item.id } })}
          title={item.title}
        >
          {item.title}
        </button>
        <CompactButton
          className="opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label={`Rename ${item.title}`}
          onClick={() => setRenameTarget(item)}
        >
          <IconEdit size={14} />
        </CompactButton>
        <CompactButton
          destructive
          className="opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label={`Delete ${item.title}`}
          onClick={() => setDeleteTarget(item)}
        >
          <IconDelete size={14} />
        </CompactButton>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <aside
        className={`shrink-0 bg-white flex flex-col overflow-hidden relative ${
          expanded ? '' : 'border-r border-neutral-200'
        } ${expanded && !sidebarPanel.resizing ? 'transition-[width] duration-300' : ''}`}
        style={{ width: expanded ? sidebarPanel.width : 56 }}
      >
        <div
          className="flex items-center justify-between p-[14px_12px_12px] shrink-0 min-h-[52px] relative"
          ref={workspaceRef}
        >
          {expanded && (
            <div className="flex-1 min-w-0 pr-2">
              <button
                className="flex items-center gap-2 w-full bg-transparent border-none cursor-pointer rounded-6 p-1 -ml-1 transition-colors hover:bg-neutral-50 text-left"
                onClick={() => setWorkspaceOpen((v) => !v)}
              >
                <span className="w-7 h-7 bg-primary-gradient rounded-8 relative shrink-0 after:absolute after:inset-[5px] after:border-2 after:border-white after:rounded-[3px] after:border-b-0 after:border-r-0" />
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex items-center gap-1">
                    <span className="text-[14px] font-semibold text-neutral-950 tracking-[-0.01em] whitespace-nowrap overflow-hidden text-ellipsis">
                      {activeWorkspace?.name ?? 'Workspace'}
                    </span>
                    <IconChevronDown size={14} className="text-neutral-400 shrink-0" />
                  </div>
                </div>
              </button>

              {workspaceOpen && (
                <div className="absolute top-[calc(100%-8px)] left-2 right-2 bg-white rounded-12 shadow-[0_0_0_1px_theme(colors.neutral.200),theme(boxShadow.xl)] p-1.5 z-50 animate-[fadeUp_0.15s_ease]">
                  <p className="text-subheading-sm text-neutral-400 px-2 pt-1.5 pb-1">Workspaces</p>
                  {workspaces.map((workspace) => (
                    <button
                      key={workspace.id}
                      className="flex items-center gap-2.5 w-full p-2 bg-transparent border-none cursor-pointer rounded-8 text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-950 text-left"
                      onClick={() => {
                        void switchWorkspace
                          .mutateAsync(workspace.id)
                          .finally(() => setWorkspaceOpen(false));
                      }}
                    >
                      <span className="w-6 h-6 rounded-6 bg-primary-alpha-10 text-primary-base flex items-center justify-center text-[10px] font-semibold shrink-0">
                        {initials(workspace.name)}
                      </span>
                      <span className="text-para-sm flex-1 truncate">{workspace.name}</span>
                    </button>
                  ))}
                  <button
                    className="flex items-center gap-2.5 w-full p-2 bg-transparent border-none cursor-pointer rounded-8 text-primary-base transition-colors hover:bg-primary-alpha-10 text-left mt-1"
                    onClick={() => {
                      setWorkspaceOpen(false);
                      setWorkspaceModalOpen(true);
                    }}
                  >
                    <span className="text-para-sm flex-1 truncate">New workspace</span>
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 shrink-0 hover:text-neutral-950 hover:bg-neutral-50"
            onClick={() => setExpanded((v) => !v)}
            aria-label="Toggle sidebar"
            style={!expanded ? { margin: '0 auto' } : undefined}
          >
            <IconSidebar size={18} />
          </button>
        </div>

        <div className="h-px bg-neutral-200 shrink-0 m-0" />

        {/* Search bar (expanded mode) */}
        {expanded && (
          <div className="p-[6px_8px_2px] shrink-0">
            {searchMode ? (
              <div className="flex items-center gap-1.5 bg-white border-[1.5px] border-primary-base rounded-8 p-[5px_8px] shadow-[0_0_0_3px_theme(colors.primary.alpha-10)]">
                <span className="text-neutral-400 flex items-center shrink-0">
                  <IconSearch size={14} />
                </span>
                <input
                  ref={searchRef}
                  className="flex-1 border-none outline-none bg-transparent text-neutral-950 min-w-0 placeholder:text-neutral-400 text-para-sm"
                  type="text"
                  placeholder="Search chats…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setSearchMode(false)}
                />
                <button
                  className="flex items-center bg-transparent border-none cursor-pointer text-neutral-400 p-0.5 rounded-4 shrink-0 transition-colors hover:text-neutral-950"
                  onClick={() => setSearchMode(false)}
                  aria-label="Close search"
                >
                  <IconClose size={14} />
                </button>
              </div>
            ) : (
              <button
                className="flex items-center gap-2 w-full p-[6px_10px] bg-neutral-50 border border-neutral-200 rounded-8 cursor-pointer text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-600 text-para-sm"
                onClick={() => setSearchMode(true)}
              >
                <IconSearch size={14} />
                <span>Search…</span>
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col gap-0.5 p-[10px_8px_6px] shrink-0">
          <button
            className="flex items-center gap-2.5 p-[7px_8px] bg-transparent border-none cursor-pointer rounded-8 text-primary-base transition-colors hover:bg-primary-alpha-10 whitespace-nowrap overflow-hidden"
            onClick={() => {
              void createConversation
                .mutateAsync(undefined)
                .then((res: { conversation: PublicConversation }) => {
                  navigate('/app/chat', { state: { conversationId: res.conversation.id } });
                });
            }}
            title="New chat"
          >
            <span className="flex items-center justify-center w-[26px] h-[26px] bg-primary-alpha-10 rounded-6 shrink-0">
              <IconPlus size={16} />
            </span>
            {expanded && <span className="text-label-sm">New chat</span>}
          </button>

          <Link
            to="/app/chat"
            className={`flex items-center gap-2.5 p-[7px_8px] border-none cursor-pointer rounded-8 no-underline transition-colors whitespace-nowrap overflow-hidden ${isActive('/app/chat') ? 'text-neutral-950 bg-neutral-200' : 'bg-transparent text-neutral-400 hover:text-neutral-950 hover:bg-neutral-50'}`}
            title="Chat"
          >
            <IconChat size={18} />
            {expanded && <span className="text-para-sm">Chat</span>}
          </Link>

          <Link
            to="/app/library"
            className={`flex items-center gap-2.5 p-[7px_8px] border-none cursor-pointer rounded-8 no-underline transition-colors whitespace-nowrap overflow-hidden ${isActive('/app/library') ? 'text-neutral-950 bg-neutral-200' : 'bg-transparent text-neutral-400 hover:text-neutral-950 hover:bg-neutral-50'}`}
            title="Library"
          >
            <IconLibrary size={18} />
            {expanded && <span className="text-para-sm">Library</span>}
          </Link>

          {!expanded && (
            <button
              className="flex items-center gap-2.5 p-[7px_8px] border-none cursor-pointer rounded-8 no-underline transition-colors whitespace-nowrap overflow-hidden bg-transparent text-neutral-400 hover:text-neutral-950 hover:bg-neutral-50"
              title="Search"
              onClick={() => {
                setExpanded(true);
                setSearchMode(true);
              }}
            >
              <IconSearch size={18} />
            </button>
          )}
        </div>

        {/* History / search results */}
        {expanded && (
          <div className="flex-1 overflow-y-auto p-[4px_8px_8px]">
            {conversationsQuery.isLoading ? (
              <div className="p-2">
                <LoadingState label="Loading chats…" />
              </div>
            ) : conversationsQuery.isError ? (
              <div className="p-2">
                <Alert
                  status="error"
                  variant="stroke"
                  compact
                  title="Couldn’t load chats"
                  description={getErrorMessage(conversationsQuery.error, 'Try again in a moment.')}
                  action={
                    <button
                      type="button"
                      className="text-para-xs text-primary-base bg-transparent border-none cursor-pointer p-0 underline"
                      onClick={() => void conversationsQuery.refetch()}
                    >
                      Retry
                    </button>
                  }
                />
              </div>
            ) : searchResults !== null ? (
              searchResults.length === 0 ? (
                <div className="p-2">
                  <EmptyState title="No results found" description="Try a different search term." />
                </div>
              ) : (
                <div className="mb-3">{searchResults.map(renderConversationRow)}</div>
              )
            ) : conversationGroups.length === 0 ? (
              <div className="p-2">
                <EmptyState title="No conversations yet" description="Start a new chat to begin." />
              </div>
            ) : (
              conversationGroups.map((group: { group: string; items: PublicConversation[] }) => (
                <div key={group.group} className="mb-3">
                  <p className="text-neutral-400 tracking-[0.06em] p-[8px_8px_4px] text-subheading-md">
                    {group.group}
                  </p>
                  {group.items.map(renderConversationRow)}
                </div>
              ))
            )}
          </div>
        )}

        <div className="shrink-0 pb-2">
          <div className="h-px bg-neutral-200 shrink-0 m-0" />
          <div className="relative p-[8px_8px_4px]" ref={profileRef}>
            <button
              className={`flex items-center gap-2.5 w-full p-[6px_6px] bg-transparent border-none cursor-pointer rounded-10 transition-colors overflow-hidden hover:bg-neutral-50`}
              onClick={() => setProfileOpen((v) => !v)}
              aria-label="Profile"
            >
              <span className="w-8 h-8 rounded-full bg-neutral-200 text-neutral-950 flex items-center justify-center text-[11px] font-semibold shrink-0 tracking-[0.02em]">
                {userInitials}
              </span>
              {expanded && (
                <>
                  <div className="flex-1 flex flex-col items-start overflow-hidden min-w-0">
                    <span className="text-label-sm whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-neutral-950">
                      {displayName}
                    </span>
                    <span className="text-para-xs whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-neutral-400">
                      {displayEmail}
                    </span>
                  </div>
                  <IconChevronDown size={14} className="text-neutral-950 shrink-0" />
                </>
              )}
            </button>

            {profileOpen && (
              <div
                className={`absolute bg-white rounded-12 shadow-[0_0_0_1px_theme(colors.neutral.200),theme(boxShadow.xl)] p-2 z-50 animate-[fadeUp_0.15s_ease] ${expanded ? 'bottom-[calc(100%+4px)] left-2 right-2' : 'left-[56px] right-auto w-[200px] bottom-0'}`}
              >
                <div className="flex items-center gap-2.5 p-[4px_4px_8px]">
                  <span className="w-9 h-9 rounded-full bg-neutral-200 text-neutral-950 flex items-center justify-center text-xs font-semibold shrink-0 tracking-[0.02em]">
                    {userInitials}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-label-sm text-neutral-950 whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                      {displayName}
                    </p>
                    <p className="text-para-xs text-neutral-400 whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                      {displayEmail}
                    </p>
                  </div>
                </div>
                <div className="h-px bg-neutral-200 my-1" />
                <button
                  className="flex items-center gap-2.5 w-full p-[8px_8px] bg-transparent border-none cursor-pointer rounded-8 text-neutral-600 transition-colors hover:text-neutral-950 hover:bg-neutral-50"
                  onClick={() => {
                    setProfileOpen(false);
                    setSettingsOpen(true);
                  }}
                >
                  <IconSettings size={16} />
                  <span className="text-para-sm">Settings</span>
                </button>
                <button
                  className="flex items-center gap-2.5 w-full p-[8px_8px] bg-transparent border-none cursor-pointer rounded-8 transition-colors text-error-base hover:text-error-base hover:bg-red-500/10"
                  onClick={() => {
                    void logout().then(() => navigate('/app/login'));
                  }}
                >
                  <IconLogout size={16} />
                  <span className="text-para-sm">Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {expanded ? (
        <ResizeHandle
          growth="right"
          label="Resize sidebar"
          onResizeStart={sidebarPanel.beginResize}
          onNudge={sidebarPanel.nudge}
        />
      ) : null}

      <main className="flex-1 overflow-hidden min-w-0 flex flex-col">
        <Outlet />
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <FormModal
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open && !modalBusy) setRenameTarget(null);
        }}
        title="Rename chat"
        description="Choose a clear title for this conversation."
        label="Title"
        initialValue={renameTarget?.title ?? ''}
        confirmLabel="Save"
        loading={modalBusy}
        validate={(value) => (value.length > 200 ? 'Title must be 200 characters or fewer' : null)}
        onSubmit={submitRename}
      />
      <ConfirmModal
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !modalBusy) setDeleteTarget(null);
        }}
        title="Delete chat?"
        description={
          deleteTarget
            ? `Are you sure you want to delete “${deleteTarget.title}”? Its messages will be gone for good.`
            : 'Are you sure you want to delete this chat? Its messages will be gone for good.'
        }
        confirmLabel="Delete"
        destructive
        loading={modalBusy}
        onConfirm={submitDelete}
      />
      <FormModal
        open={workspaceModalOpen}
        onOpenChange={(open) => {
          if (!open && !modalBusy) setWorkspaceModalOpen(false);
        }}
        title="New workspace"
        description="Workspaces keep documents, chats, and credits separate."
        label="Workspace name"
        placeholder="e.g. Product research"
        confirmLabel="Create"
        loading={modalBusy}
        onSubmit={submitWorkspace}
      />
    </div>
  );
}
