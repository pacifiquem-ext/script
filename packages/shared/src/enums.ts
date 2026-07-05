import { z } from 'zod';

export const workspaceRoleSchema = z.enum(['owner', 'admin', 'member']);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const documentStatusSchema = z.enum(['pending', 'processing', 'ready', 'failed']);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const documentSourceSchema = z.enum(['local', 'url', 'drive', 'dropbox', 'onedrive', 'box']);
export type DocumentSource = z.infer<typeof documentSourceSchema>;

export const messageRoleSchema = z.enum(['user', 'assistant']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const integrationProviderSchema = z.enum(['drive', 'dropbox', 'onedrive', 'box']);
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;

export const integrationStatusSchema = z.enum(['connected', 'disconnected', 'error']);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const otpPurposeSchema = z.enum(['signup_verify', 'password_reset', 'login']);
export type OtpPurpose = z.infer<typeof otpPurposeSchema>;

export const workspacePlanSchema = z.enum(['free', 'pro', 'team']);
export type WorkspacePlan = z.infer<typeof workspacePlanSchema>;

export const creditLedgerReasonSchema = z.enum([
  'signup_grant',
  'admin_adjust',
  'chat_usage',
  'ingestion_usage',
  'purchase_pending',
]);
export type CreditLedgerReason = z.infer<typeof creditLedgerReasonSchema>;
