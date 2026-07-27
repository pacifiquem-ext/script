/** Measure caret pixel position inside a textarea (for Cursor-style popovers). */
export function getTextareaCaretCoordinates(
  element: HTMLTextAreaElement,
  position: number,
): { top: number; left: number; height: number } {
  const div = document.createElement('div');
  const style = window.getComputedStyle(element);
  const properties = [
    'direction',
    'boxSizing',
    'width',
    'height',
    'overflowX',
    'overflowY',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'fontStretch',
    'fontSize',
    'fontSizeAdjust',
    'lineHeight',
    'fontFamily',
    'textAlign',
    'textTransform',
    'textIndent',
    'textDecoration',
    'letterSpacing',
    'wordSpacing',
    'tabSize',
    'whiteSpace',
    'wordBreak',
    'wordWrap',
  ] as const;

  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  div.style.top = '0';
  div.style.left = '-9999px';

  for (const prop of properties) {
    div.style.setProperty(
      prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
      style.getPropertyValue(prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)),
    );
  }

  div.textContent = element.value.slice(0, position);
  const span = document.createElement('span');
  span.textContent = element.value.slice(position) || '.';
  div.appendChild(span);
  document.body.appendChild(div);

  const coordinates = {
    top: span.offsetTop,
    left: span.offsetLeft,
    height: Number.parseFloat(style.lineHeight) || span.offsetHeight || 20,
  };
  document.body.removeChild(div);
  return coordinates;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Split text into plain / @mention segments for known document names. */
export function splitMentionSegments(
  text: string,
  names: string[],
): Array<{ text: string; mention: boolean }> {
  if (!text || names.length === 0) return [{ text, mention: false }];
  const unique = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!unique.length) return [{ text, mention: false }];
  const pattern = new RegExp(`(@(?:${unique.map(escapeRegExp).join('|')}))(?=\\s|$|[.,;:!?])`, 'g');
  const parts: Array<{ text: string; mention: boolean }> = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), mention: false });
    parts.push({ text: match[0]!, mention: true });
    last = start + match[0]!.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), mention: false });
  return parts.length ? parts : [{ text, mention: false }];
}
