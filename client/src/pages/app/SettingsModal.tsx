import React, { useRef, useState } from 'react';
import type { PublicAuditEvent, PublicInvite } from '@script/shared';
import { useNavigate } from 'react-router-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { getApiBaseUrl } from '../../lib/api-client';
import {
  IconClose,
  IconUser,
  IconSettings,
  IconLock,
  IconGrid,
  IconSparkles,
  IconChevronDown,
  IconCheck,
  IconPlus,
  IconArrowRight,
} from '../../lib/icons';
import {
  IconGoogleDrive,
  IconDropbox,
  IconOneDrive,
  IconBox,
} from '../../components/ui/BrandIcons';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { FormModal } from '../../components/ui/FormModal';
import { Input } from '../../components/ui/Input';
import { LoadingState } from '../../components/ui/LoadingState';
import { notify } from '../../components/ui/toast-alert';
import { useAuth } from '../../contexts/useAuth';
import { useWorkspaceMembers, useWorkspaces } from '../../lib/workspaces';
import { apiRequest } from '../../lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { getErrorMessage } from '../../lib/form-errors';
import { changePasswordBodySchema, type IntegrationProvider } from '@script/shared';
import {
  PROVIDER_LABELS,
  useIntegrationMutations,
  useIntegrations,
} from '../../lib/integrations-api';

interface Props {
  open: boolean;
  onClose: () => void;
}

type WorkspaceUsage = {
  plan: string;
  creditBalance: number;
  memberCount: number;
  seatCap: number | null;
  seatsUsed: number;
  documentCount: number;
  conversationCount: number;
  meetingCount: number;
  licenseEnforced: boolean;
};

function formatPlanLabel(plan: string | undefined) {
  if (!plan) return 'Free';
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '•';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

const SIDEBAR_NAV = [
  {
    category: 'Workspace',
    items: [
      { id: 'people', label: 'People', icon: <IconUser size={16} /> },
      { id: 'license', label: 'License', icon: <IconLock size={16} /> },
      { id: 'billing', label: 'Plans & Billing', icon: <IconGrid size={16} /> },
    ],
  },
  {
    category: 'Account',
    items: [
      { id: 'profile', label: 'Profile', icon: <IconUser size={16} /> },
      { id: 'preferences', label: 'Preferences', icon: <IconSettings size={16} /> },
      { id: 'appearance', label: 'Appearance', icon: <IconGrid size={16} /> },
    ],
  },
  {
    category: 'Security',
    items: [
      { id: 'security', label: 'Security', icon: <IconLock size={16} /> },
      { id: 'privacy', label: 'Privacy & Data', icon: <IconLock size={16} /> },
    ],
  },
  {
    category: 'Features',
    items: [
      { id: 'ai', label: 'AI Settings', icon: <IconSparkles size={16} /> },
      { id: 'integrations', label: 'Integrations', icon: <IconGrid size={16} /> },
      { id: 'advanced', label: 'Advanced', icon: <IconSettings size={16} /> },
    ],
  },
];

function SegmentedBar({ percentage, color }: { percentage: number; color: string }) {
  const totalSegments = 40;
  const activeSegments = Math.round((percentage / 100) * totalSegments);

  return (
    <div className="flex gap-[2px] items-center h-2 w-full max-w-[240px]">
      {Array.from({ length: totalSegments }).map((_, i) => (
        <div
          key={i}
          className="flex-1 h-full rounded-full"
          style={{ backgroundColor: i < activeSegments ? color : '#f5f5f5' }}
        />
      ))}
    </div>
  );
}

export function SettingsModal({ open, onClose }: Props) {
  const [activeItem, setActiveItem] = useState('workspace');
  const dialogRef = useRef<HTMLDivElement>(null);
  const { user, logout, refresh } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const navigate = useNavigate();
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [privacyMessage, setPrivacyMessage] = useState<string | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const workspacesQuery = useWorkspaces(open && Boolean(user));
  const membersQuery = useWorkspaceMembers(
    open && Boolean(user) && (activeItem === 'people' || activeItem === 'workspace'),
  );
  const auditQuery = useQuery({
    queryKey: ['workspace-audit'],
    enabled: open && Boolean(user) && activeItem === 'people',
    queryFn: async () => {
      const data = await apiRequest<{ events: PublicAuditEvent[] }>(
        '/workspaces/current/audit?pageSize=20',
      );
      return data.events;
    },
  });
  const invitesQuery = useQuery({
    queryKey: ['workspace-invites'],
    enabled: open && Boolean(user) && activeItem === 'people',
    queryFn: async () => {
      const data = await apiRequest<{
        invites: Array<{
          id: string;
          email: string;
          role: string;
          status: string;
          expiresAt: string;
        }>;
      }>('/workspaces/current/invites');
      return data.invites;
    },
  });
  const licenseQuery = useQuery({
    queryKey: ['license'],
    enabled: open && Boolean(user) && activeItem === 'license',
    queryFn: async () => {
      const data = await apiRequest<{
        license: {
          phase: string;
          enforced: boolean;
          seats: number;
          seatsUsed: number;
          seatsRemaining: number | null;
          canWrite: boolean;
          message: string | null;
          expiresAt: string | null;
          customerId: string | null;
        };
      }>('/license');
      return data.license;
    },
  });
  const usageQuery = useQuery({
    queryKey: ['workspace-usage'],
    enabled: open && Boolean(user) && (activeItem === 'workspace' || activeItem === 'billing'),
    queryFn: async () => apiRequest<WorkspaceUsage>('/credits/usage'),
  });
  const workspaces = workspacesQuery.data ?? [];
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === user?.lastWorkspaceId) ?? workspaces[0];
  const members = membersQuery.data ?? [];
  const invites = invitesQuery.data ?? [];
  const license = licenseQuery.data;
  const usage = usageQuery.data;
  const displayName = user?.name ?? 'Account';
  const displayEmail = user?.email ?? '';
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [bulkEmails, setBulkEmails] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [licenseMessage, setLicenseMessage] = useState<string | null>(null);
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeySecret, setApiKeySecret] = useState<string | null>(null);
  const [creditShareMember, setCreditShareMember] = useState<{
    id: string;
    name: string;
    creditShare: number | null;
  } | null>(null);
  const [creditShareBusy, setCreditShareBusy] = useState(false);
  useFocusTrap(open, dialogRef, () => {
    if (profileEditOpen || deleteConfirmOpen || creditShareMember) return;
    onClose();
  });
  const apiKeysQuery = useQuery({
    queryKey: ['api-keys'],
    enabled: open && (activeItem === 'advanced' || activeItem === 'integrations'),
    queryFn: async () => {
      const data = await apiRequest<{
        apiKeys: Array<{
          id: string;
          name: string;
          keyPrefix: string;
          createdAt: string;
          revokedAt: string | null;
        }>;
      }>('/api-keys');
      return data.apiKeys;
    },
  });
  const integrationsQuery = useIntegrations(open && activeItem === 'integrations');
  const integrationMutations = useIntegrationMutations();
  const preferencesQuery = useQuery({
    queryKey: ['preferences'],
    enabled:
      open &&
      (activeItem === 'preferences' ||
        activeItem === 'appearance' ||
        activeItem === 'ai' ||
        activeItem === 'profile'),
    queryFn: async () => {
      const data = await apiRequest<{
        preferences: { theme: string; locale: string; aiTone: string };
      }>('/me/preferences');
      return data.preferences;
    },
  });
  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    enabled: open && activeItem === 'security',
    queryFn: async () => {
      const data = await apiRequest<{
        sessions: Array<{
          id: string;
          userAgent: string | null;
          current: boolean;
          createdAt: string;
        }>;
      }>('/me/sessions');
      return data.sessions;
    },
  });

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordMessage(null);
    setPasswordLoading(true);
    try {
      const body = changePasswordBodySchema.parse(passwordForm);
      await apiRequest('/auth/change-password', { method: 'POST', body });
      setPasswordMessage('Password updated. Sign in again on other devices.');
      setPasswordForm({ currentPassword: '', newPassword: '' });
    } catch (error) {
      setPasswordError(getErrorMessage(error, 'Unable to change password'));
    } finally {
      setPasswordLoading(false);
    }
  }

  const renderContent = () => {
    switch (activeItem) {
      case 'workspace':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">
                  Workspace overview
                </h2>
                <p className="text-[14px] text-neutral-500">
                  Manage your workspace ownership and settings.
                </p>
              </div>
              <button
                className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 shrink-0 hover:text-neutral-950 hover:bg-neutral-100"
                onClick={onClose}
                aria-label="Close"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col">
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Overview</h3>
                  <p className="text-[13px] text-neutral-500">Workspace summary and details.</p>
                </div>
                <div className="flex-1 flex flex-col gap-6 w-full max-w-[500px]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center text-[12px] font-bold text-neutral-600 shrink-0">
                        {initialsFromName(displayName)}
                      </div>
                      <div className="flex flex-col">
                        <p className="text-[14px] font-medium text-neutral-950">
                          {displayName}{' '}
                          <span className="text-neutral-400 font-normal">({displayEmail})</span>
                        </p>
                        <p className="text-[12px] text-neutral-400 mt-0.5">
                          Member since{' '}
                          <span className="text-neutral-950 font-medium">{memberSince}</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="px-4 py-1.5 border border-neutral-200 rounded-8 bg-white text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                      onClick={() => setActiveItem('people')}
                    >
                      Manage
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-8 mt-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[13px] text-neutral-500">Workspace</span>
                      <span className="text-[14px] font-medium text-neutral-950">
                        {activeWorkspace?.name ?? 'Workspace'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[13px] text-neutral-500">Your role</span>
                      <span className="text-[14px] font-medium text-neutral-950 capitalize">
                        {activeWorkspace?.role ?? '—'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[13px] text-neutral-500">Team members</span>
                      <span className="text-[14px] font-medium text-neutral-950">
                        {usage
                          ? usage.seatCap == null
                            ? `${usage.memberCount} · Open dev — no seat cap`
                            : `${usage.seatsUsed} / ${usage.seatCap} seats`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[13px] text-neutral-500">Billing</span>
                      <span className="text-[14px] font-medium text-neutral-950">
                        Credits only (payments post-v1)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Activity</h3>
                  <p className="text-[13px] text-neutral-500">Usage analytics and metrics.</p>
                </div>
                <div className="flex-1 w-full max-w-[500px]">
                  {usageQuery.isLoading ? (
                    <LoadingState label="Loading usage…" />
                  ) : usageQuery.isError ? (
                    <ErrorState
                      message="Could not load usage. Retry to load live workspace totals."
                      onRetry={() => void usageQuery.refetch()}
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-y-6 gap-x-8">
                      <div className="flex flex-col gap-1">
                        <span className="text-[13px] text-neutral-500">Conversations</span>
                        <span className="text-[14px] font-medium text-neutral-950">
                          {(usage?.conversationCount ?? 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[13px] text-neutral-500">Meetings</span>
                        <span className="text-[14px] font-medium text-neutral-950">
                          {(usage?.meetingCount ?? 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[13px] text-neutral-500">Documents</span>
                        <span className="text-[14px] font-medium text-neutral-950">
                          {(usage?.documentCount ?? 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[13px] text-neutral-500">Credits remaining</span>
                        <span className="text-[14px] font-medium text-neutral-950">
                          {(
                            usage?.creditBalance ??
                            activeWorkspace?.creditBalance ??
                            0
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Plan usage</h3>
                  <p className="text-[13px] text-neutral-500">
                    Usage limits and current consumption.
                  </p>
                </div>
                <div className="flex-1 flex flex-col gap-5 w-full max-w-[500px]">
                  {usage?.seatCap != null ? (
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] text-neutral-600 w-[100px]">Team seats</span>
                      <div className="flex-1 mx-4">
                        <SegmentedBar
                          percentage={
                            usage.seatCap > 0
                              ? Math.min(100, (usage.seatsUsed / usage.seatCap) * 100)
                              : 0
                          }
                          color="#7c3aed"
                        />
                      </div>
                      <span className="text-[12px] text-neutral-500 w-[72px] text-right">
                        {usage.seatsUsed}/{usage.seatCap}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[13px] text-neutral-600 m-0">Open dev — no seat cap</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-neutral-600 w-[100px]">Credits</span>
                    <span className="text-[13px] text-neutral-700">
                      {(
                        usage?.creditBalance ??
                        activeWorkspace?.creditBalance ??
                        0
                      ).toLocaleString()}{' '}
                      remaining
                    </span>
                  </div>
                  <p className="text-[12px] text-neutral-500 m-0">
                    Storage bytes and API quotas are not metered in v1. Counts above are live
                    workspace totals.
                  </p>
                </div>
              </div>
            </div>
          </>
        );

      case 'billing':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">
                  Plans &amp; Billing
                </h2>
                <p className="text-[14px] text-neutral-500">
                  Manage subscription and billing settings.
                </p>
              </div>
              <button
                className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 shrink-0 hover:text-neutral-950 hover:bg-neutral-100"
                onClick={onClose}
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col">
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Current plan</h3>
                  <p className="text-[13px] text-neutral-500">Plan details and usage overview.</p>
                </div>
                <div className="flex-1 flex flex-col gap-6 w-full max-w-[500px]">
                  <div className="p-5 bg-neutral-50 rounded-20 border border-neutral-200">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-alpha-10 flex items-center justify-center text-primary-base shrink-0">
                          <IconSparkles size={18} />
                        </div>
                        <div className="flex flex-col">
                          <p className="text-[15px] font-bold text-neutral-950">
                            {formatPlanLabel(usage?.plan ?? activeWorkspace?.plan)} plan
                          </p>
                          <p className="text-[12px] text-neutral-500 mt-0.5">
                            In-workspace credits only. No payment processor in v1.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[13px] font-medium text-neutral-700">
                            Workspace credits
                          </span>
                          <span className="text-[13px] font-bold text-primary-base">
                            {(
                              usage?.creditBalance ??
                              activeWorkspace?.creditBalance ??
                              0
                            ).toLocaleString()}{' '}
                            remaining
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 pt-2">
                        <div className="flex items-center gap-3">
                          <Button variant="primary" size="sm" className="w-fit" disabled>
                            Upgrade Plan
                          </Button>
                          <Button
                            variant="neutral"
                            mode="stroke"
                            size="sm"
                            className="w-fit"
                            disabled
                          >
                            Purchase Credits
                          </Button>
                        </div>
                        <p className="text-[12px] text-neutral-500 m-0">
                          Payments are post-v1 (ADR 0006). Upgrade and purchase are disabled until a
                          processor ships.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-y-4 gap-x-8 mt-2 px-1">
                    <div className="flex flex-col gap-1">
                      <span className="text-[13px] text-neutral-500">Seat usage</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[14px] font-medium text-neutral-950">
                        {usage
                          ? usage.seatCap == null
                            ? 'Open dev — no seat cap'
                            : `${usage.seatsUsed} / ${usage.seatCap} active seats`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[13px] text-neutral-500">Next renewal</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[14px] font-medium text-neutral-950">
                        None — no subscription
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">
                    Billing history
                  </h3>
                  <p className="text-[13px] text-neutral-500">Invoice history and payments.</p>
                </div>
                <div className="flex-1 flex flex-col gap-5 w-full max-w-[500px]">
                  <div className="flex flex-col gap-0 border-t border-neutral-100 mt-2 pt-2">
                    <p className="text-[13px] text-neutral-500 py-4 m-0">
                      No invoices. This install does not bill through a payment processor yet.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        );

      case 'profile':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">Profile</h2>
                <p className="text-[14px] text-neutral-500">
                  Manage your personal account settings.
                </p>
              </div>
              <button
                type="button"
                className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 shrink-0 hover:text-neutral-950 hover:bg-neutral-100"
                onClick={onClose}
                aria-label="Close"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col">
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">
                    Profile picture
                  </h3>
                  <p className="text-[13px] text-neutral-500">Update your avatar image.</p>
                </div>
                <div className="flex-1 flex flex-col gap-4 w-full max-w-[500px]">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover bg-neutral-200"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-neutral-200 flex items-center justify-center text-[14px] font-bold text-neutral-600">
                      {initialsFromName(displayName)}
                    </div>
                  )}
                  <div>
                    <h4 className="text-[14px] font-medium text-neutral-950">Upload image</h4>
                    <p className="text-[12px] text-neutral-400 mt-1">PNG or JPEG, up to 5MB.</p>
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      const body = new FormData();
                      body.append('file', file);
                      void fetch(`${getApiBaseUrl()}/me/avatar`, {
                        method: 'POST',
                        credentials: 'include',
                        body,
                      })
                        .then(async (res) => {
                          if (!res.ok) throw new Error('Avatar upload failed');
                          await refresh();
                          notify.success('Avatar updated');
                        })
                        .catch((err) => notify.error(getErrorMessage(err, 'Could not upload avatar')));
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="neutral"
                    mode="stroke"
                    className="w-fit"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    Upload
                  </Button>
                </div>
              </div>
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">
                    Personal information
                  </h3>
                  <p className="text-[13px] text-neutral-500">Edit your account details.</p>
                </div>
                <div className="flex-1 flex flex-col gap-6 w-full max-w-[500px]">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <p className="text-[14px] font-medium text-neutral-950">{displayName}</p>
                      <p className="text-[12px] text-neutral-400 mt-0.5">
                        Member since{' '}
                        <span className="text-neutral-950 font-medium">{memberSince}</span>
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="neutral"
                      mode="stroke"
                      className="w-fit"
                      onClick={() => setProfileEditOpen(true)}
                    >
                      Edit profile
                    </Button>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] gap-y-4 gap-x-8 mt-2 border-t border-neutral-100 pt-6">
                    <span className="text-[13px] text-neutral-500">Full name</span>
                    <span className="text-[14px] font-medium text-neutral-950">{displayName}</span>
                    <span className="text-[13px] text-neutral-500">Email address</span>
                    <span className="text-[14px] font-medium text-neutral-950">{displayEmail}</span>
                    <span className="text-[13px] text-neutral-500">Time zone</span>
                    <span className="text-[14px] font-medium text-neutral-950">
                      {Intl.DateTimeFormat().resolvedOptions().timeZone}
                      <span className="text-neutral-400 font-normal"> (this device)</span>
                    </span>
                    <span className="text-[13px] text-neutral-500">Language</span>
                    <span className="text-[14px] font-medium text-neutral-950">
                      {preferencesQuery.data?.locale ?? 'en'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        );

      case 'people':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">Team members</h2>
                <p className="text-[14px] text-neutral-500">
                  Manage workspace members and credit shares.
                </p>
              </div>
              <button
                type="button"
                className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8"
                onClick={onClose}
                aria-label="Close"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="member@company.com"
                  className="h-9 px-3 border border-neutral-200 rounded-8 text-[13px]"
                  aria-label="Invite email"
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="w-fit"
                  leftIcon={<IconPlus size={14} />}
                  onClick={() => {
                    setInviteError(null);
                    void apiRequest<{
                      invite?: PublicInvite;
                      acceptUrl?: string;
                      member?: { id: string };
                    }>('/workspaces/current/members', {
                      method: 'POST',
                      body: { email: inviteEmail, role: 'member' },
                    })
                      .then(async (res) => {
                        if (res.acceptUrl) {
                          setLastInviteUrl(res.acceptUrl);
                          try {
                            await navigator.clipboard.writeText(res.acceptUrl);
                            notify.success('Invite sent. Link copied.');
                          } catch {
                            notify.success('Invite sent. Copy the link below.');
                          }
                        } else {
                          notify.success('Member added.');
                        }
                        setInviteEmail('');
                        await membersQuery.refetch();
                        await invitesQuery.refetch();
                      })
                      .catch((err) => setInviteError(getErrorMessage(err, 'Invite failed')));
                  }}
                >
                  Invite Member
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-neutral-500" htmlFor="bulk-invites">
                  Bulk invite (one email per line)
                </label>
                <textarea
                  id="bulk-invites"
                  value={bulkEmails}
                  onChange={(e) => setBulkEmails(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-8 text-[13px] resize-y"
                />
                <Button
                  variant="neutral"
                  size="sm"
                  className="w-fit"
                  onClick={() => {
                    const emails = bulkEmails
                      .split(/[\n,;]+/)
                      .map((e) => e.trim())
                      .filter(Boolean);
                    setInviteError(null);
                    void apiRequest('/workspaces/current/invites/bulk', {
                      method: 'POST',
                      body: { emails, role: 'member' },
                    })
                      .then(async () => {
                        setBulkEmails('');
                        await invitesQuery.refetch();
                      })
                      .catch((err) => setInviteError(getErrorMessage(err, 'Bulk invite failed')));
                  }}
                >
                  Send bulk invites
                </Button>
              </div>
              {inviteError && (
                <Alert
                  status="error"
                  variant="stroke"
                  compact
                  description={inviteError}
                  onDismiss={() => setInviteError(null)}
                />
              )}
              <p className="text-[13px] text-neutral-500">{members.length} members</p>
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between border border-neutral-200 rounded-10 p-3 gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate">{member.name}</p>
                    <p className="text-[12px] text-neutral-500 truncate">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[12px] capitalize px-2 py-1 rounded-6 bg-neutral-50 border border-neutral-100">
                      {member.role}
                    </span>
                    <label className="flex items-center gap-1 text-[11px] text-neutral-500">
                      Clearance
                      <input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={member.clearanceLevel ?? 0}
                        className="w-14 h-7 px-1 border border-neutral-200 rounded-6 text-[12px]"
                        aria-label={`Clearance for ${member.name}`}
                        onBlur={(e) => {
                          const clearanceLevel = Number(e.target.value);
                          if (Number.isNaN(clearanceLevel)) return;
                          void apiRequest(`/workspaces/current/members/${member.id}/clearance`, {
                            method: 'PATCH',
                            body: { clearanceLevel },
                          })
                            .then(() => membersQuery.refetch())
                            .catch((err) =>
                              setInviteError(getErrorMessage(err, 'Clearance update failed')),
                            );
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="text-[11px] text-primary-base bg-transparent border-none cursor-pointer"
                      onClick={() =>
                        setCreditShareMember({
                          id: member.id,
                          name: member.name,
                          creditShare: member.creditShare ?? null,
                        })
                      }
                    >
                      {member.creditShare == null ? 'Set share' : `${member.creditShare}%`}
                    </button>
                  </div>
                </div>
              ))}
              {invites.filter((i) => i.status === 'pending').length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  <p className="text-[13px] font-medium text-neutral-950">Pending invites</p>
                  {invites
                    .filter((i) => i.status === 'pending')
                    .map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between border border-neutral-200 rounded-10 p-3 gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-[13px] truncate">{invite.email}</p>
                          <p className="text-[11px] text-neutral-500">
                            Expires {new Date(invite.expiresAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            variant="neutral"
                            size="sm"
                            className="w-fit"
                            onClick={() => {
                              void apiRequest<{ acceptUrl?: string }>(
                                `/workspaces/current/invites/${invite.id}/resend`,
                                { method: 'POST' },
                              )
                                .then(async (res) => {
                                  if (res.acceptUrl) {
                                    setLastInviteUrl(res.acceptUrl);
                                    try {
                                      await navigator.clipboard.writeText(res.acceptUrl);
                                      notify.success('Invite resent. Link copied.');
                                    } catch {
                                      notify.success('Invite resent. Copy the link below.');
                                    }
                                  } else {
                                    notify.success('Invite resent.');
                                  }
                                })
                                .catch((err) =>
                                  setInviteError(getErrorMessage(err, 'Resend failed')),
                                );
                            }}
                          >
                            Resend
                          </Button>
                          <Button
                            variant="neutral"
                            size="sm"
                            className="w-fit"
                            onClick={() => {
                              void apiRequest(`/workspaces/current/invites/${invite.id}`, {
                                method: 'DELETE',
                              })
                                .then(() => invitesQuery.refetch())
                                .catch((err) =>
                                  setInviteError(getErrorMessage(err, 'Revoke failed')),
                                );
                            }}
                          >
                            Revoke
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
              {lastInviteUrl ? (
                <div className="flex flex-col gap-2 mt-2 border border-neutral-200 rounded-12 p-3">
                  <p className="text-[13px] font-medium text-neutral-950">Invite link</p>
                  <p className="text-[12px] text-neutral-500 break-all">{lastInviteUrl}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="neutral"
                    mode="stroke"
                    className="w-fit"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(lastInviteUrl)
                        .then(() => notify.success('Link copied'))
                        .catch(() => notify.error('Could not copy link'));
                    }}
                  >
                    Copy link
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-col gap-2 mt-4">
                <p className="text-[13px] font-medium text-neutral-950">Recent activity</p>
                {auditQuery.isLoading ? (
                  <LoadingState label="Loading audit…" />
                ) : auditQuery.isError ? (
                  <Alert
                    status="error"
                    variant="stroke"
                    compact
                    description={getErrorMessage(auditQuery.error, 'Could not load audit events')}
                  />
                ) : (auditQuery.data ?? []).length === 0 ? (
                  <p className="text-[12px] text-neutral-500">No audit events yet.</p>
                ) : (
                  <ul className="list-none m-0 p-0 flex flex-col gap-2">
                    {(auditQuery.data ?? []).map((event) => (
                      <li
                        key={event.id}
                        className="border border-neutral-100 rounded-10 px-3 py-2 text-[12px] text-neutral-700"
                      >
                        <span className="font-medium text-neutral-950">{event.action}</span>
                        {event.targetType ? ` · ${event.targetType}` : ''}
                        <span className="text-neutral-400">
                          {' '}
                          · {new Date(event.createdAt).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        );

      case 'license':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">License</h2>
                <p className="text-[14px] text-neutral-500">
                  Install activation key, seats, and write access (Org-P7).
                </p>
              </div>
              <button
                type="button"
                className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8"
                onClick={onClose}
                aria-label="Close"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col gap-4">
              {licenseQuery.isLoading && (
                <p className="text-[13px] text-neutral-500">Loading license…</p>
              )}
              {license && (
                <div className="border border-neutral-200 rounded-10 p-4 flex flex-col gap-2">
                  <p className="text-[13px]">
                    Phase:{' '}
                    <span className="font-medium capitalize">
                      {license.phase.replace('_', ' ')}
                    </span>
                    {!license.enforced && (
                      <span className="text-neutral-500"> (open-dev, not enforced)</span>
                    )}
                  </p>
                  <p className="text-[13px] text-neutral-600">
                    Seats: {license.seatsUsed}
                    {license.enforced ? ` / ${license.seats}` : ' (unlimited)'}
                  </p>
                  {license.expiresAt && (
                    <p className="text-[13px] text-neutral-600">
                      Expires {new Date(license.expiresAt).toLocaleString()}
                    </p>
                  )}
                  {license.customerId && (
                    <p className="text-[12px] text-neutral-500">Customer {license.customerId}</p>
                  )}
                  {license.message && (
                    <Alert
                      status="warning"
                      variant="stroke"
                      compact
                      description={license.message}
                    />
                  )}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-neutral-500" htmlFor="license-key">
                  Activation key
                </label>
                <textarea
                  id="license-key"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  rows={3}
                  placeholder="script1...."
                  className="w-full px-3 py-2 border border-neutral-200 rounded-8 text-[12px] font-mono resize-y"
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="w-fit"
                  onClick={() => {
                    setLicenseError(null);
                    setLicenseMessage(null);
                    void apiRequest('/license/activate', {
                      method: 'POST',
                      body: { key: licenseKey.trim() },
                    })
                      .then(async () => {
                        setLicenseKey('');
                        setLicenseMessage('License activated.');
                        await licenseQuery.refetch();
                      })
                      .catch((err) => setLicenseError(getErrorMessage(err, 'Activation failed')));
                  }}
                >
                  Activate key
                </Button>
              </div>
              {licenseError && (
                <Alert
                  status="error"
                  variant="stroke"
                  compact
                  description={licenseError}
                  onDismiss={() => setLicenseError(null)}
                />
              )}
              {licenseMessage && (
                <Alert
                  status="success"
                  variant="stroke"
                  compact
                  description={licenseMessage}
                  onDismiss={() => setLicenseMessage(null)}
                />
              )}
            </div>
          </>
        );

      case 'preferences':
      case 'appearance':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">
                  {activeItem === 'appearance' ? 'Appearance' : 'Preferences'}
                </h2>
                <p className="text-[14px] text-neutral-500">Saved to your account.</p>
              </div>
              <button
                type="button"
                className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8"
                onClick={onClose}
                aria-label="Close"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col gap-4 max-w-[520px]">
              <label className="flex flex-col gap-1 text-[13px]">
                Theme
                <select
                  className="h-9 px-3 border border-neutral-200 rounded-8"
                  value={preferencesQuery.data?.theme ?? 'system'}
                  onChange={(e) =>
                    void apiRequest('/me/preferences', {
                      method: 'PATCH',
                      body: { theme: e.target.value },
                    }).then(() => preferencesQuery.refetch())
                  }
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[13px]">
                Locale
                <input
                  className="h-9 px-3 border border-neutral-200 rounded-8"
                  defaultValue={preferencesQuery.data?.locale ?? 'en'}
                  onBlur={(e) =>
                    void apiRequest('/me/preferences', {
                      method: 'PATCH',
                      body: { locale: e.target.value || 'en' },
                    }).then(() => preferencesQuery.refetch())
                  }
                />
              </label>
            </div>
          </>
        );
      case 'ai':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">AI Settings</h2>
                <p className="text-[14px] text-neutral-500">
                  Read-only defaults for this workspace.
                </p>
              </div>
              <button
                type="button"
                className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8"
                onClick={onClose}
                aria-label="Close"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col gap-3 max-w-[520px] text-[13px] text-neutral-700">
              <div className="flex justify-between border border-neutral-200 rounded-10 p-3">
                <span>Model</span>
                <span className="font-medium">claude-sonnet-4-6</span>
              </div>
              <div className="flex justify-between border border-neutral-200 rounded-10 p-3">
                <span>Temperature</span>
                <span className="font-medium">0.2 (fixed)</span>
              </div>
              <label className="flex flex-col gap-1">
                Response tone
                <select
                  className="h-9 px-3 border border-neutral-200 rounded-8"
                  value={preferencesQuery.data?.aiTone ?? 'default'}
                  onChange={(e) =>
                    void apiRequest('/me/preferences', {
                      method: 'PATCH',
                      body: { aiTone: e.target.value },
                    }).then(() => preferencesQuery.refetch())
                  }
                >
                  <option value="default">Default</option>
                  <option value="concise">Concise</option>
                  <option value="detailed">Detailed</option>
                </select>
              </label>
              <p className="text-[12px] text-neutral-400">
                Model and temperature are managed by script and are not user-editable.
              </p>
            </div>
          </>
        );

      case 'integrations': {
        const providerMeta: Record<
          IntegrationProvider,
          { icon: React.ReactNode; description: string }
        > = {
          drive: {
            icon: <IconGoogleDrive size={24} />,
            description: 'Import documents from your Google Drive account.',
          },
          dropbox: {
            icon: <IconDropbox size={24} />,
            description: 'Sync folders and documents from Dropbox.',
          },
          onedrive: {
            icon: <IconOneDrive size={24} />,
            description: 'Access your Microsoft 365 documents.',
          },
          box: {
            icon: <IconBox size={24} />,
            description: 'High-security document management integration.',
          },
        };
        const providers = integrationsQuery.data?.providers ?? [];

        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">Integrations</h2>
                <p className="text-[14px] text-neutral-500">
                  Connect your favorite tools to import documents.
                </p>
              </div>
              <button
                className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 shrink-0 hover:text-neutral-950 hover:bg-neutral-100"
                onClick={onClose}
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col">
              <div className="py-8 border-t border-neutral-200 flex flex-col gap-6">
                <div className="flex flex-col gap-1 mb-2">
                  <h3 className="text-[14px] font-semibold text-neutral-950">Cloud Storage</h3>
                  <p className="text-[13px] text-neutral-500">
                    Bulk import files from your storage providers. Configure OAuth apps in{' '}
                    <code className="text-[12px]">server/.env</code> (see ENV.md).
                  </p>
                </div>

                {integrationsQuery.isLoading ? (
                  <p className="text-[13px] text-neutral-500">Loading integrations…</p>
                ) : integrationsQuery.isError ? (
                  <Alert
                    status="error"
                    variant="stroke"
                    title="Failed to load integrations"
                    description={getErrorMessage(integrationsQuery.error)}
                    compact
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {providers.map((row) => {
                      const meta = providerMeta[row.provider];
                      const busy =
                        integrationMutations.connect.isPending ||
                        integrationMutations.disconnect.isPending;
                      return (
                        <div
                          key={row.provider}
                          className="flex items-center justify-between p-4 bg-neutral-50 rounded-16 border border-neutral-200 hover:border-neutral-300 transition-all"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-12 bg-white flex items-center justify-center shadow-sm border border-neutral-100">
                              {meta.icon}
                            </div>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="text-[14px] font-bold text-neutral-950">
                                  {PROVIDER_LABELS[row.provider]}
                                </span>
                                {row.connected && (
                                  <span className="flex items-center gap-1 text-[10px] text-green-600 font-bold bg-green-50 px-1.5 py-0.5 rounded-full border border-green-100">
                                    <IconCheck size={10} /> CONNECTED
                                  </span>
                                )}
                                {!row.configured && (
                                  <span className="text-[10px] text-neutral-500 font-semibold bg-neutral-100 px-1.5 py-0.5 rounded-full">
                                    NOT CONFIGURED
                                  </span>
                                )}
                              </div>
                              <p className="text-[12px] text-neutral-500 mt-0.5">
                                {meta.description}
                                {row.integration?.accountEmail
                                  ? ` · ${row.integration.accountEmail}`
                                  : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {row.connected ? (
                              <Button
                                variant="error"
                                mode="lighter"
                                size="sm"
                                loading={busy}
                                onClick={() => {
                                  void integrationMutations.disconnect
                                    .mutateAsync(row.provider)
                                    .then(() => notify.success('Disconnected'))
                                    .catch((err) => notify.error(getErrorMessage(err)));
                                }}
                              >
                                Disconnect
                              </Button>
                            ) : (
                              <Button
                                variant="primary"
                                size="sm"
                                rightIcon={<IconArrowRight size={14} />}
                                loading={busy}
                                disabled={!row.configured}
                                onClick={() => {
                                  void integrationMutations.connect
                                    .mutateAsync(row.provider)
                                    .then((res) => {
                                      window.location.assign(res.url);
                                    })
                                    .catch((err) => notify.error(getErrorMessage(err)));
                                }}
                              >
                                Connect
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="py-8 border-t border-neutral-200 flex flex-col gap-6">
                <div className="flex flex-col gap-1 mb-2">
                  <h3 className="text-[14px] font-semibold text-neutral-950">Developer Tools</h3>
                  <p className="text-[13px] text-neutral-500">Automate your document workflows.</p>
                </div>

                <div className="p-5 bg-neutral-950 rounded-20 text-white relative overflow-hidden">
                  <div className="relative z-10 flex flex-col gap-3">
                    <h4 className="text-[15px] font-bold">API Access</h4>
                    <p className="text-[13px] text-white/60 mt-1 max-w-[340px]">
                      Build custom integrations using our secure API. Generate keys to get started.
                    </p>
                    <div className="flex gap-2 mt-2">
                      <input
                        value={apiKeyName}
                        onChange={(e) => setApiKeyName(e.target.value)}
                        placeholder="Key name"
                        className="h-9 px-3 rounded-8 text-[13px] text-neutral-950 flex-1"
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          void apiRequest<{ secret: string; apiKey: { id: string } }>('/api-keys', {
                            method: 'POST',
                            body: { name: apiKeyName || 'API key' },
                          }).then(async (res) => {
                            setApiKeySecret(res.secret);
                            setApiKeyName('');
                            await apiKeysQuery.refetch();
                          });
                        }}
                      >
                        Generate API Key
                      </Button>
                    </div>
                    {apiKeySecret && (
                      <p className="text-[12px] text-white/80 break-all">
                        Copy now: {apiKeySecret}
                      </p>
                    )}
                    {(apiKeysQuery.data ?? []).map((key) => (
                      <div
                        key={key.id}
                        className="flex items-center justify-between gap-3 text-[12px] bg-white/10 rounded-10 p-2"
                      >
                        <span>
                          {key.name} ({key.keyPrefix}…){key.revokedAt ? ' revoked' : ''}
                        </span>
                        {!key.revokedAt && (
                          <button
                            className="text-white underline"
                            onClick={() =>
                              void apiRequest(`/api-keys/${key.id}`, { method: 'DELETE' }).then(
                                () => apiKeysQuery.refetch(),
                              )
                            }
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-primary-base/20 to-transparent pointer-events-none" />
                  <IconSparkles
                    size={120}
                    className="absolute -bottom-10 -right-10 text-white/5 pointer-events-none rotate-12"
                  />
                </div>
              </div>
            </div>
          </>
        );
      }

      case 'security':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">Security</h2>
                <p className="text-[14px] text-neutral-500">
                  Manage account security and access control.
                </p>
              </div>
              <button
                className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 shrink-0 hover:text-neutral-950 hover:bg-neutral-100"
                onClick={onClose}
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col">
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">
                    Account security
                  </h3>
                  <p className="text-[13px] text-neutral-500">
                    Password &amp; login security settings.
                  </p>
                </div>
                <div className="flex-1 flex flex-col gap-6 w-full max-w-[500px]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-medium text-neutral-950">Password</h4>
                      <div className="flex flex-col gap-2 mt-3 max-w-[320px]">
                        <input
                          type="password"
                          placeholder="Current password"
                          value={passwordForm.currentPassword}
                          onChange={(e) =>
                            setPasswordForm((s) => ({ ...s, currentPassword: e.target.value }))
                          }
                          className="h-9 px-3 border border-neutral-200 rounded-8 text-[13px] outline-none focus:border-primary-base"
                        />
                        <input
                          type="password"
                          placeholder="New password"
                          value={passwordForm.newPassword}
                          onChange={(e) =>
                            setPasswordForm((s) => ({ ...s, newPassword: e.target.value }))
                          }
                          className="h-9 px-3 border border-neutral-200 rounded-8 text-[13px] outline-none focus:border-primary-base"
                        />
                        {passwordError && (
                          <Alert
                            status="error"
                            variant="stroke"
                            compact
                            description={passwordError}
                            onDismiss={() => setPasswordError(null)}
                          />
                        )}
                        {passwordMessage && (
                          <Alert
                            status="success"
                            variant="lighter"
                            compact
                            description={passwordMessage}
                            onDismiss={() => setPasswordMessage(null)}
                          />
                        )}
                        <Button
                          variant="neutral"
                          mode="stroke"
                          size="sm"
                          loading={passwordLoading}
                          onClick={() => void handleChangePassword()}
                        >
                          Update password
                        </Button>
                        <div className="mt-4 flex flex-col gap-2">
                          <h4 className="text-[13px] font-medium text-neutral-950">
                            Active sessions
                          </h4>
                          {(sessionsQuery.data ?? []).map((session) => (
                            <div
                              key={session.id}
                              className="flex items-center justify-between text-[12px] border border-neutral-100 rounded-8 p-2 gap-2"
                            >
                              <span className="truncate">
                                {session.userAgent || 'Unknown device'}
                                {session.current ? ' (this device)' : ''}
                              </span>
                              {!session.current && (
                                <button
                                  className="text-error-base shrink-0 bg-transparent border-none cursor-pointer text-[12px]"
                                  onClick={() =>
                                    void apiRequest(`/me/sessions/${session.id}`, {
                                      method: 'DELETE',
                                    })
                                      .then(() => {
                                        notify.success('Session revoked');
                                        return sessionsQuery.refetch();
                                      })
                                      .catch((err) =>
                                        notify.error(
                                          getErrorMessage(err, 'Could not revoke session'),
                                        ),
                                      )
                                  }
                                >
                                  Revoke
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <p className="text-[12px] text-neutral-400">
                        Sessions sync from refresh tokens. Use Forgot password on the login page to
                        recover access.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        );

      case 'privacy':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">
                  Privacy &amp; Data
                </h2>
                <p className="text-[14px] text-neutral-500">
                  Export your data or permanently delete your account.
                </p>
              </div>
              <button
                type="button"
                className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8"
                onClick={onClose}
                aria-label="Close"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col gap-8 max-w-[560px]">
              <section className="flex flex-col gap-3 border border-neutral-200 rounded-20 p-5">
                <h3 className="text-[14px] font-semibold text-neutral-950">Export your data</h3>
                <p className="text-[13px] text-neutral-500">
                  Download a JSON archive of your profile, workspaces, documents metadata, chat
                  history, and time-limited file links.
                </p>
                <Button
                  size="sm"
                  variant="neutral"
                  mode="stroke"
                  loading={privacyLoading}
                  onClick={() => {
                    setPrivacyError(null);
                    setPrivacyMessage(null);
                    setPrivacyLoading(true);
                    void fetch(`${getApiBaseUrl()}/me/export`, { credentials: 'include' })
                      .then(async (res) => {
                        if (!res.ok) throw new Error('Export failed');
                        const blob = await res.blob();
                        const href = URL.createObjectURL(blob);
                        const anchor = document.createElement('a');
                        anchor.href = href;
                        anchor.download = `script-export-${user?.id ?? 'account'}.json`;
                        anchor.click();
                        URL.revokeObjectURL(href);
                        setPrivacyMessage('Export downloaded.');
                      })
                      .catch((err) => setPrivacyError(getErrorMessage(err, 'Export failed')))
                      .finally(() => setPrivacyLoading(false));
                  }}
                >
                  Download export
                </Button>
              </section>

              <section className="flex flex-col gap-3 border border-error-light rounded-20 p-5 bg-error-lighter/40">
                <h3 className="text-[14px] font-semibold text-error-base">Delete account</h3>
                <p className="text-[13px] text-neutral-600">
                  This is permanent. Sole-owned workspaces and their files are removed. Shared
                  workspaces keep other members; ownership transfers when you are the only owner.
                </p>
                <Input
                  label="Type your email to confirm"
                  type="email"
                  value={deleteEmail}
                  onChange={(e) => setDeleteEmail(e.target.value)}
                />
                <Input
                  label="Current password"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="error"
                  loading={privacyLoading}
                  disabled={
                    !deleteEmail.trim() ||
                    !deletePassword ||
                    deleteEmail.trim().toLowerCase() !== displayEmail.toLowerCase()
                  }
                  onClick={() => {
                    setPrivacyError(null);
                    setPrivacyMessage(null);
                    setDeleteConfirmOpen(true);
                  }}
                >
                  Delete my account
                </Button>
              </section>
              {privacyMessage && (
                <Alert
                  status="success"
                  variant="lighter"
                  compact
                  description={privacyMessage}
                  onDismiss={() => setPrivacyMessage(null)}
                />
              )}
              {privacyError && (
                <Alert
                  status="error"
                  variant="stroke"
                  compact
                  description={privacyError}
                  onDismiss={() => setPrivacyError(null)}
                />
              )}
            </div>
          </>
        );

      case 'advanced':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">Advanced</h2>
                <p className="text-[14px] text-neutral-500">
                  Workspace API keys for programmatic access.
                </p>
              </div>
              <button
                type="button"
                className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8"
                onClick={onClose}
                aria-label="Close"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col gap-4 max-w-[560px]">
              <Input
                label="Key name"
                value={apiKeyName}
                onChange={(e) => setApiKeyName(e.target.value)}
                placeholder="CI deploy"
              />
              <Button
                variant="primary"
                size="sm"
                className="w-fit"
                onClick={() => {
                  void apiRequest<{ secret: string; apiKey: { id: string } }>('/api-keys', {
                    method: 'POST',
                    body: { name: apiKeyName.trim() || 'API key' },
                  })
                    .then(async (res) => {
                      setApiKeySecret(res.secret);
                      setApiKeyName('');
                      await apiKeysQuery.refetch();
                      notify.success('API key created. Copy it now — it will not be shown again.');
                    })
                    .catch((err) => notify.error(getErrorMessage(err, 'Could not create API key')));
                }}
              >
                Generate API Key
              </Button>
              {apiKeySecret ? (
                <Alert
                  status="information"
                  variant="lighter"
                  compact
                  title="Copy now"
                  description={apiKeySecret}
                />
              ) : null}
              {(apiKeysQuery.data ?? []).length === 0 ? (
                <p className="text-[13px] text-neutral-500">No API keys yet.</p>
              ) : (
                <ul className="list-none m-0 p-0 flex flex-col gap-2">
                  {(apiKeysQuery.data ?? []).map((key) => (
                    <li
                      key={key.id}
                      className="flex items-center justify-between gap-3 border border-neutral-200 rounded-12 p-3 text-[13px]"
                    >
                      <span>
                        {key.name} ({key.keyPrefix}…){key.revokedAt ? ' revoked' : ''}
                      </span>
                      {!key.revokedAt && (
                        <Button
                          type="button"
                          size="sm"
                          variant="error"
                          className="w-fit"
                          onClick={() =>
                            void apiRequest(`/api-keys/${key.id}`, { method: 'DELETE' })
                              .then(async () => {
                                notify.success('API key revoked');
                                await apiKeysQuery.refetch();
                              })
                              .catch((err) =>
                                notify.error(getErrorMessage(err, 'Could not revoke key')),
                              )
                          }
                        >
                          Revoke
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        );

      default:
        return (
          <div className="flex flex-col h-full">
            <div className="flex justify-end p-4">
              <button
                type="button"
                className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8"
                onClick={onClose}
                aria-label="Close"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="flex items-center justify-center flex-1 text-neutral-400">
              <p>Select an option from the sidebar.</p>
            </div>
          </div>
        );
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[200] flex items-center justify-center"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(1024px,95vw)] h-[min(760px,90vh)] bg-white z-[201] rounded-[24px] shadow-2xl flex overflow-hidden"
      >
        {/* Sidebar */}
        <div className="w-[260px] bg-white border-r border-neutral-200 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 pt-6 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <span className="px-3 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Workspace
              </span>
              <button
                className={`flex items-center justify-between w-full p-[8px_12px] rounded-10 border-none cursor-pointer transition-colors ${activeItem === 'workspace' ? 'bg-neutral-100' : 'bg-transparent hover:bg-neutral-50'}`}
                onClick={() => setActiveItem('workspace')}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center text-[10px] font-bold text-neutral-600">
                    {initialsFromName(displayName).slice(0, 1)}
                  </div>
                  <span className="text-[13px] font-medium text-neutral-950">{displayName}</span>
                  <span className="text-[9px] font-bold text-primary-base bg-primary-alpha-10 px-1.5 py-0.5 rounded-4 tracking-wide">
                    {formatPlanLabel(usage?.plan ?? activeWorkspace?.plan).toUpperCase()}
                  </span>
                </div>
                <IconChevronDown size={14} className="text-neutral-400 -rotate-90" />
              </button>

              {SIDEBAR_NAV[0].items.map((item) => (
                <button
                  key={item.id}
                  className={`flex items-center gap-3 w-full p-[8px_12px] rounded-10 border-none cursor-pointer transition-colors ${activeItem === item.id ? 'bg-neutral-100 text-neutral-950 font-medium' : 'bg-transparent text-neutral-500 hover:bg-neutral-50 hover:text-neutral-950 font-medium'}`}
                  onClick={() => setActiveItem(item.id)}
                >
                  <span className="text-neutral-400">{item.icon}</span>
                  <span className="text-[13px]">{item.label}</span>
                </button>
              ))}
            </div>

            {SIDEBAR_NAV.slice(1).map((section, idx) => (
              <div key={idx} className="flex flex-col gap-1">
                <span className="px-3 pb-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                  {section.category}
                </span>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    className={`flex items-center gap-3 w-full p-[8px_12px] rounded-10 border-none cursor-pointer transition-colors ${activeItem === item.id ? 'bg-neutral-100 text-neutral-950 font-medium' : 'bg-transparent text-neutral-500 hover:bg-neutral-50 hover:text-neutral-950 font-medium'}`}
                    onClick={() => setActiveItem(item.id)}
                  >
                    <span className="text-neutral-400">{item.icon}</span>
                    <span className="text-[13px]">{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Content Pane */}
        <div className="flex-1 flex flex-col bg-white overflow-y-auto relative">
          {renderContent()}
        </div>
      </div>

      <FormModal
        open={Boolean(creditShareMember)}
        onOpenChange={(open) => {
          if (!open && !creditShareBusy) setCreditShareMember(null);
        }}
        title="Credit share"
        description={
          creditShareMember
            ? `Set ${creditShareMember.name}'s share of workspace credits (0–100). Leave empty to clear.`
            : undefined
        }
        label="Share percent"
        placeholder="e.g. 25"
        initialValue={creditShareMember?.creditShare?.toString() ?? ''}
        confirmLabel="Save share"
        loading={creditShareBusy}
        allowEmpty
        validate={(value) => {
          if (!value) return null;
          const n = Number(value);
          if (!Number.isFinite(n) || n < 0 || n > 100 || !Number.isInteger(n)) {
            return 'Enter a whole number from 0 to 100, or leave empty to clear';
          }
          return null;
        }}
        onSubmit={async (value) => {
          if (!creditShareMember) return;
          setCreditShareBusy(true);
          try {
            const creditShare = value.trim() === '' ? null : Number(value);
            await apiRequest(`/workspaces/current/members/${creditShareMember.id}/credit-share`, {
              method: 'PATCH',
              body: { creditShare },
            });
            await membersQuery.refetch();
            notify.success('Credit share updated');
            setCreditShareMember(null);
          } catch (err) {
            notify.error(getErrorMessage(err, 'Could not update credit share'));
          } finally {
            setCreditShareBusy(false);
          }
        }}
      />
      <FormModal
        open={profileEditOpen}
        onOpenChange={(open) => {
          if (!open && !profileBusy) setProfileEditOpen(false);
        }}
        title="Edit profile"
        description="Update the name shown to people in this workspace."
        label="Full name"
        initialValue={displayName}
        confirmLabel="Save"
        loading={profileBusy}
        validate={(value) => (value.trim().length === 0 ? 'Name is required' : null)}
        onSubmit={async (value) => {
          setProfileBusy(true);
          try {
            await apiRequest('/me', { method: 'PATCH', body: { name: value.trim() } });
            await refresh();
            notify.success('Profile updated');
            setProfileEditOpen(false);
          } catch (err) {
            notify.error(getErrorMessage(err, 'Could not update profile'));
          } finally {
            setProfileBusy(false);
          }
        }}
      />
      <ConfirmModal
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete your account?"
        description="This is permanent. Sole-owned workspaces and their files are removed."
        confirmLabel="Delete account"
        destructive
        loading={privacyLoading}
        onConfirm={() => {
          setPrivacyLoading(true);
          void apiRequest('/me', {
            method: 'DELETE',
            body: { email: deleteEmail.trim(), password: deletePassword },
          })
            .then(async () => {
              setDeleteConfirmOpen(false);
              onClose();
              await logout();
              navigate('/app/signup');
            })
            .catch((err) => setPrivacyError(getErrorMessage(err, 'Deletion failed')))
            .finally(() => setPrivacyLoading(false));
        }}
      />
    </>
  );
}
