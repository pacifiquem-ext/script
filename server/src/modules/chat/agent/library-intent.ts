/** Catalog / inventory questions that must use list_library_documents (not similarity alone). */
const INVENTORY_RE =
  /\b(whole library|my library|the library|all (my )?documents|all (my )?files|list (all )?(my )?(documents|files)|what('s| is) in (my |the )?library|library inventory|inventory of (my |the )?library|every file|each file|one[- ]line summary|summar(y|ies) of (my |the )?library|catalog (my |the )?(library|files|documents)|overview of (my |the )?(library|documents|files))\b/i;

export function isLibraryInventoryIntent(content: string): boolean {
  const text = content.trim();
  if (!text) return false;
  return INVENTORY_RE.test(text);
}
