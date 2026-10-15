'use strict';
/**
 * Shared helpers for all pdfsuite tools.
 */
const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, rgb, StandardFonts } = require('pdf-lib');

function ensureDirFor(file) {
  const dir = path.dirname(path.resolve(file));
  if (dir && dir !== '.' && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function loadPdf(input, opts = {}) {
  const bytes = fs.readFileSync(input);
  return await PDFDocument.load(bytes, { ignoreEncryption: true, ...opts });
}

async function savePdf(doc, output) {
  ensureDirFor(output);
  fs.writeFileSync(output, await doc.save());
  return output;
}

/** Parse "1,3-5,8" into zero-based page indices (validated against pageCount). */
function parsePages(spec, pageCount) {
  if (!spec) return [...Array(pageCount).keys()];
  const out = new Set();
  for (const part of String(spec).split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`Bad page spec part: "${part}" (use e.g. 1,3-5)`);
    const a = parseInt(m[1], 10), b = m[2] ? parseInt(m[2], 10) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
      if (i < 1 || i > pageCount) throw new Error(`Page ${i} out of range (1-${pageCount})`);
      out.add(i - 1);
    }
  }
  return [...out].sort((x, y) => x - y);
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

async function standardFont(doc, name = 'helvetica') {
  const map = {
    helvetica: StandardFonts.Helvetica, helveticaBold: StandardFonts.HelveticaBold,
    times: StandardFonts.TimesRoman, timesBold: StandardFonts.TimesRomanBold,
    courier: StandardFonts.Courier,
  };
  return await doc.embedFont(map[name] || StandardFonts.Helvetica);
}

/** pdfjs-dist text items grouped into lines, top-to-bottom, left-to-right. */
async function pageLines(pdfjsDoc, pageNum) {
  const page = await pdfjsDoc.getPage(pageNum);
  const tc = await page.getTextContent();
  const rows = new Map();
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const [, , , , e, f] = it.transform;
    const key = Math.round(f / 4) * 4; // bucket rows by y
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push({ x: e, y: f, str: it.str });
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, items]) => {
      items.sort((a, b) => a.x - b.x);
      return items.map(i => i.str).join(' ');
    });
}

async function loadPdfjs(input) {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const data = new Uint8Array(fs.readFileSync(input));
  return await pdfjs.getDocument({ data }).promise;
}

/** Render a pdfjs page to a PNG buffer using @napi-rs/canvas. */
async function renderPagePng(pdfjsPage, scale = 2) {
  const { createCanvas } = require('@napi-rs/canvas');
  const viewport = pdfjsPage.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pdfjsPage.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toBuffer('image/png');
}

/** Copy bytes into a fresh ArrayBuffer (pdf-lib DataView reads .buffer at offset 0,
 *  which breaks for Node Buffers backed by a larger pool). */
function cleanU8(bytes) {
  return new Uint8Array(bytes);
}

module.exports = {
  fs, path, PDFDocument, PDFName, rgb,
  ensureDirFor, loadPdf, savePdf, parsePages, hexToRgb, standardFont,
  pageLines, loadPdfjs, renderPagePng, cleanU8,
};
