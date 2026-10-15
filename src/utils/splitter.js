const WHATSAPP_SAFE_LIMIT = 3500; // conservative, well under WhatsApp's ~65k hard limit

/**
 * Split long text into WhatsApp-friendly chunks, preserving paragraph
 * boundaries where possible and never cutting a word in half.
 * @param {string} text
 * @param {number} limit
 * @returns {string[]}
 */
export function splitMessage(text, limit = WHATSAPP_SAFE_LIMIT) {
  if (!text) return [''];
  if (text.length <= limit) return [text];

  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;

    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (para.length <= limit) {
      current = para;
      continue;
    }

    // Paragraph itself too long: split on sentence/word boundaries.
    let remaining = para;
    while (remaining.length > limit) {
      let cut = remaining.lastIndexOf(' ', limit);
      if (cut <= 0) cut = limit;
      chunks.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    current = remaining;
  }

  if (current) chunks.push(current);

  if (chunks.length > 1) {
    return chunks.map((chunk, i) => `[Part ${i + 1}/${chunks.length}]\n${chunk}`);
  }
  return chunks;
}
