// Preserve the original text, cutting only at sentence/clause or word boundaries.
// A small first segment reduces time to playback; later segments retain prosody.
export function speechSegments(text) {
  const words = text.trim().split(/\s+/);
  const chunks = [];
  let offset = 0;
  while (offset < words.length) {
    if (chunks.length === 31) { chunks.push(words.slice(offset).join(' ')); break; }
    const limit = chunks.length ? 35 : 8;
    let end = Math.min(offset + limit, words.length);
    for (let i = offset; i < end; i++) {
      if (/[.!?]["')\]]?$/.test(words[i]) && (i - offset >= 3 || i === words.length - 1) || !chunks.length && /[,;:]["')\]]?$/.test(words[i]) && i - offset >= 3) { end = i + 1; break; }
    }
    chunks.push(words.slice(offset, end).join(' '));
    offset = end;
  }
  return chunks;
}
