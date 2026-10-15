/**
 * Light post-processing to make sure AI output is WhatsApp-friendly.
 * The system prompt already instructs the model to avoid Markdown headers
 * and tables, but this is a safety net in case the model slips.
 */
export function formatForWhatsApp(text) {
  if (!text) return text;

  let out = text;

  // Convert Markdown headers (#, ##, ###) into bold lines.
  out = out.replace(/^#{1,6}\s*(.+)$/gm, '*$1*');

  // Convert Markdown bold **text** to WhatsApp bold *text*
  out = out.replace(/\*\*(.+?)\*\*/g, '*$1*');

  // Collapse 3+ blank lines into 2.
  out = out.replace(/\n{3,}/g, '\n\n');

  return out.trim();
}
