import { registerMastraToolsOnCompatRegistry } from '../../../mastra/register-compat-tools';

/** Idempotent bootstrap — registers Mastra domain tools on the ADR 0011 compat registry. */
export function registerBuiltinTools(): void {
  registerMastraToolsOnCompatRegistry();
}
