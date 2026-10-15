'use strict';
/**
 * SVG sanitizer for downloaded SVGs: strips <script>, event-handler
 * attributes, javascript:/data: URLs, <foreignObject>, ENTITY declarations.
 * Returns a clean SVG string safe to embed.
 */
function sanitizeSvg(svg) {
  let s = String(svg || '');
  // scripts
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  // foreignObject (can embed HTML)
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '');
  // event handler attributes: onclick=, onload=, ...
  s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // dangerous URL schemes in href/src attributes
  s = s.replace(/(href|xlink:href|src)\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, a, _q, v1, v2) => {
    const val = v1 !== undefined ? v1 : v2;
    if (/^\s*(javascript|data|vbscript)\s*:/i.test(val)) return `${a}=""`;
    return m;
  });
  // CSS url(javascript:...) inside style attributes
  s = s.replace(/url\(\s*(javascript|data|vbscript)\s*:/gi, 'url(#blocked:');
  // processing instructions except the XML declaration
  s = s.replace(/<\?/g, (m, off, full) => {
    const end = full.indexOf('?>', off);
    const pi = end >= 0 ? full.slice(off, end + 2) : '';
    return /^<\?xml[\s?]/i.test(pi) ? pi : '';
  });
  // ENTITY declarations (billion-laughs)
  s = s.replace(/<!ENTITY[\s\S]*?>/gi, '');
  s = s.replace(/<!DOCTYPE[^>]*\[/gi, '<!DOCTYPE svg [');
  return s;
}

module.exports = { sanitizeSvg };
