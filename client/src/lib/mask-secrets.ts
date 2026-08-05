/** Redact common secret shapes before showing workflow step labels in UI. */
export function maskSecrets(text: string): string {
  return text
    .replace(/\bghp_[A-Za-z0-9]{20,}\b/g, 'ghp_••••••••')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, 'github_pat_••••••••')
    .replace(/\bsk-[A-Za-z0-9]{20,}\b/g, 'sk-••••••••')
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, 'xox•-••••••••');
}
