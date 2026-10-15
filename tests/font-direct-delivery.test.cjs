'use strict';
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const fs = require('node:fs/promises');
const axios = require('axios');
const font = require('../plugins/font-downloader');
const webSearch = require('../plugins/font-web-search');
const db = require('../lib/fontCatalogDb');

async function main() {
  const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  let lastConfig;
  axios.get = async (_url, config) => {
    lastConfig = config;
    return {
      status: 200,
      headers: { 'content-type': 'application/zip', 'content-length': String(zipBytes.length) },
      data: Readable.from([zipBytes]),
    };
  };
  const sent = [];
  const sock = { async sendMessage(_jid, content) { sent.push(content); return content; } };
  const message = { key: { remoteJid: 'font-test@s.whatsapp.net' } };
  const context = { chatId: message.key.remoteJid, prefix: '-' };
  const rows = [
    { id: 1, name: 'Test Font One', author: 'Tester', license: 'OFL', category: 'Serif', source: 'google-fonts', url: 'https://fonts.example.test/page', download_url: 'https://fonts.example.test/test.zip' },
  ];
  await font.deliverFontRows(sock, message, context, rows, { title: 'TEST DELIVERY', maxFiles: 1 });
  const attachments = sent.filter(x => x && x.document);
  assert.equal(attachments.length, 1, 'one actual document should be sent');
  assert.equal(attachments[0].mimetype, 'application/zip');
  assert.equal(attachments[0].fileName, 'Test_Font_One.zip');
  assert.ok(Buffer.isBuffer(attachments[0].document));
  assert.ok(!sent.some(x => typeof x.text === 'string' && x.text.includes('https://fonts.example.test')),
    'no saved download URL should be displayed');
  assert.equal(lastConfig.headers.Referer, 'https://fonts.example.test/page');
  const textReplies = sent.filter(x => typeof x.text === 'string').map(x => x.text);
  assert.ok(textReplies.every(text => !text.includes('Preparing') && !text.includes('***') && !text.includes('*')),
    'progress/result messages must not contain unwanted italic/bold markdown');

  const htmlHead = Buffer.from('<!doctype html><html><body>not a font</body></html>');
  assert.throws(() => font._test.detectFileType(htmlHead, 'text/html'), /web page|text/);
  assert.equal(font._test.detectFileType(Buffer.from('wOF2fontdata'), 'application/octet-stream').ext, '.woff2');
  assert.equal(db._test.makeWhere({ downloadableOnly: true }).sql.includes("COALESCE(download_url, '')"), true);

  const html = '<a href="broken-ghost.font"><strong>Broken Ghost</strong></a> by <a href="segments">Segments Design</a> Free for personal use';
  const parsed = webSearch._test.parseSearch(html, 'ghost');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, 'Broken Ghost');
  assert.ok(parsed[0].download_url.includes('dl.dafont.com'));

  // A saved URL that serves HTML should fall back to explicit public download links on the font page.
  const responses = [
    { status: 200, headers: { 'content-type': 'text/html' }, data: Readable.from([Buffer.from('<!doctype html><html>download page</html>')]) },
    { status: 200, headers: { 'content-type': 'text/html' }, data: '<html><a href="/download?file=font.zip">Download ZIP</a></html>' },
    { status: 200, headers: { 'content-type': 'application/zip', 'content-length': String(zipBytes.length) }, data: Readable.from([zipBytes]) },
  ];
  const requested = [];
  axios.get = async (url, config) => { requested.push({ url, config }); const next = responses.shift(); if (!next) throw new Error('unexpected request'); return next; };
  const fallback = await font.downloadFontFileForRow({
    name: 'Fallback Font', download_url: 'https://fonts.example.test/landing', url: 'https://fonts.example.test/font-page',
  }, 'Fallback Font');
  assert.equal(fallback.mimetype, 'application/zip');
  assert.equal(requested.length, 3);
  assert.equal(requested[2].url, 'https://fonts.example.test/download?file=font.zip');
  await fs.rm(fallback.tempPath, { force: true });
  console.log('✅ direct attachment, plain-text summaries, Referer support, public download-link fallback, no-link behavior and scraper parser passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
