import React, { useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useCredits, useConversations, useMessages, useChatMutations } from '../lib/chat-api';
import { useDocument, useDocuments, useFolders, useLibraryMutations } from '../lib/library-api';
import {
  useCreateWorkspace,
  useSwitchWorkspace,
  useWorkspaceMembers,
  useWorkspaces,
} from '../lib/workspaces';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { FormModal } from '../components/ui/FormModal';
import { Modal, ModalContent, ModalHeader, ModalFooter } from '../components/ui/Modal';
import { showAlertToast } from '../components/ui/toast-alert';

function withQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function TrapDemo({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(active, ref);
  return (
    <div ref={ref}>
      <button type="button">one</button>
      <button type="button">two</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('focuses first focusable when active and cycles Tab', async () => {
    render(<TrapDemo active />);
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('one');
    });
    const root = screen.getByText('one').parentElement!;
    fireEvent.keyDown(root, { key: 'Tab' });
    fireEvent.keyDown(root, { key: 'Tab', shiftKey: true });
    fireEvent.keyDown(root, { key: 'Escape' });
    fireEvent.keyDown(root, { key: 'Enter' });
  });
});

describe('data hooks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads folders documents credits workspaces via apiRequest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        const json = (body: unknown) => ({
          ok: true,
          status: 200,
          json: async () => body,
        });
        if (url.includes('/folders')) return json({ folders: [{ id: 'f1', name: 'Root' }] });
        if (url.includes('/documents/d1'))
          return json({
            document: { id: 'd1', name: 'a', status: 'ready' },
          });
        if (url.includes('/documents')) return json({ data: [{ id: 'd1', name: 'a' }] });
        if (url.includes('/credits')) return json({ balance: 10, plan: 'free' });
        if (url.includes('/workspaces/current/members'))
          return json({ members: [{ id: 'm1', name: 'Ada' }] });
        if (url.includes('/workspaces')) return json({ workspaces: [{ id: 'w1', name: 'W' }] });
        if (url.includes('/conversations/c1/messages'))
          return json({ data: [{ id: 'msg', content: 'hi' }] });
        if (url.includes('/conversations'))
          return json({
            groups: [],
            conversations: [{ id: 'c1', title: 'T' }],
            data: [{ id: 'c1', title: 'T' }],
            pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
          });
        return json({});
      }),
    );

    function Probe() {
      const folders = useFolders(null, true);
      const docs = useDocuments(null, true);
      const doc = useDocument('d1');
      const credits = useCredits(true);
      const workspaces = useWorkspaces(true);
      const members = useWorkspaceMembers(true);
      const convos = useConversations(true, 'tax');
      const messages = useMessages('c1');
      return (
        <div>
          <span data-testid="folders">{folders.data?.length ?? 0}</span>
          <span data-testid="docs">{docs.data?.length ?? 0}</span>
          <span data-testid="doc">{doc.data?.id ?? ''}</span>
          <span data-testid="credits">{credits.data?.balance ?? -1}</span>
          <span data-testid="ws">{workspaces.data?.length ?? 0}</span>
          <span data-testid="members">{members.data?.length ?? 0}</span>
          <span data-testid="convos">{convos.data?.data?.length ?? 0}</span>
          <span data-testid="messages">{messages.data?.length ?? 0}</span>
        </div>
      );
    }

    withQuery(<Probe />);
    await waitFor(() => {
      expect(screen.getByTestId('folders').textContent).toBe('1');
      expect(screen.getByTestId('docs').textContent).toBe('1');
      expect(screen.getByTestId('doc').textContent).toBe('d1');
      expect(screen.getByTestId('credits').textContent).toBe('10');
      expect(screen.getByTestId('ws').textContent).toBe('1');
      expect(screen.getByTestId('members').textContent).toBe('1');
      expect(screen.getByTestId('messages').textContent).toBe('1');
    });
  });

  it('runs library and chat mutations', async () => {
    let uploadFailOnce = true;
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/documents/upload')) {
        if (uploadFailOnce) {
          uploadFailOnce = false;
          return {
            ok: false,
            status: 400,
            json: async () => ({}),
            text: async () => 'Upload failed hard',
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ document: { id: 'up1' } }),
          text: async () => '',
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => {
          if (url.includes('/folders') && init?.method === 'POST') return { folder: { id: 'nf' } };
          if (url.includes('/conversations') && init?.method === 'POST')
            return { conversation: { id: 'nc' } };
          if (url.includes('/workspaces/switch')) return { workspace: { id: 'w2' } };
          if (url.includes('/workspaces') && init?.method === 'POST')
            return { workspace: { id: 'nw' } };
          return { ok: true };
        },
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    function MutProbe() {
      const lib = useLibraryMutations();
      const chat = useChatMutations();
      const switchWs = useSwitchWorkspace();
      const createWs = useCreateWorkspace();
      return (
        <div>
          <button
            type="button"
            onClick={() => {
              void lib.createFolder.mutateAsync({ name: 'N' });
              void lib.updateFolder.mutateAsync({ folderId: 'f1', name: 'Renamed' });
              void lib.updateFolder.mutateAsync({ folderId: 'f1', parentId: null });
              void lib.deleteFolder.mutateAsync('f1');
              void lib.updateDocument.mutateAsync({ documentId: 'd1', name: 'Renamed.pdf' });
              void lib.updateDocument.mutateAsync({ documentId: 'd1', folderId: 'f2' });
              void lib.deleteDocument.mutateAsync('d1');
              void lib.reprocessDocument.mutateAsync('d1');
              void lib.importUrl.mutateAsync({ url: 'https://example.com/a.pdf' });
              void lib.uploadFile
                .mutateAsync({ file: new File(['x'], 'a.txt') })
                .catch(() => undefined);
              void lib.uploadFile.mutateAsync({
                file: new File(['x'], 'b.txt'),
                folderId: 'f1',
              });
              void chat.createConversation.mutateAsync('Title');
              void chat.createConversation.mutateAsync(undefined);
              void chat.renameConversation.mutateAsync({ id: 'c1', title: 'T2' });
              void chat.deleteConversation.mutateAsync('c1');
              void switchWs.mutateAsync('w2');
              void createWs.mutateAsync('New');
            }}
          >
            go
          </button>
        </div>
      );
    }

    withQuery(<MutProbe />);
    fireEvent.click(screen.getByText('go'));
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(5);
    });
  });
});

describe('modals', () => {
  it('renders ConfirmModal interactions', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmModal
        open
        onOpenChange={onOpenChange}
        title="Delete item?"
        description="Sure"
        confirmLabel="ConfirmDelete"
        cancelLabel="AbortDelete"
        destructive
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getAllByText('Delete item?').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('ConfirmDelete'));
    expect(onConfirm).toHaveBeenCalled();
    fireEvent.click(screen.getByText('AbortDelete'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('submits FormModal and covers Modal shell sizes', async () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <>
        <FormModal
          open
          onOpenChange={onOpenChange}
          title="Rename folder"
          label="Name"
          initialValue="Draft"
          confirmLabel="SaveName"
          onSubmit={onSubmit}
        />
        <Modal open onOpenChange={onOpenChange}>
          <ModalContent size="lg" showClose>
            <ModalHeader title="HiShell" description="There" />
            <ModalHeader title="NoDescShell" />
            <ModalFooter>
              <button type="button">ok</button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </>,
    );
    expect(screen.getAllByText('Rename folder').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('SaveName'));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });
});

describe('showAlertToast', () => {
  it('invokes toast.custom', async () => {
    const { toast } = await import('../components/ui/toast');
    const spy = vi.spyOn(toast, 'custom');
    showAlertToast('hello', { title: 'T', status: 'feature' });
    expect(spy).toHaveBeenCalled();
  });
});
