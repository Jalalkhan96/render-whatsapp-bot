'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const UPLOAD_ENDPOINT = String(process.env.GOFILE_UPLOAD_ENDPOINT || 'https://upload.gofile.io/uploadfile').trim();
const TIMEOUT_MS = Math.max(30_000, Number(process.env.GOFILE_UPLOAD_TIMEOUT_MS || 30 * 60 * 1000));
const MAX_BYTES = Math.max(1, Number(process.env.GOFILEUP_MAX_MB || 200)) * 1024 * 1024;
const UA = 'ABIX-AE-GoFileUploader/1.0';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i ? 2 : 0)} ${units[i]}`;
}

function safeFilename(name, fallback = 'abix-upload.bin') {
  const base = path.basename(String(name || '').trim());
  const cleaned = base.replace(/[\u0000-\u001F<>:"/\\|?*]+/g, '_').replace(/\s+/g, ' ').trim();
  return (cleaned || fallback).slice(0, 180);
}

function normalizeUploadResponse(body) {
  const data = body?.data || {};
  const status = String(body?.status || data?.status || '').toLowerCase();
  const downloadPage = data.downloadPage || data.download_page || body.downloadPage || body.link || null;
  const directLink = data.directLink || data.direct_link || body.directLink || null;
  const code = data.code || data.folderCode || data.foldercode || body.code || null;
  const fileId = data.fileId || data.file_id || null;
  const parentFolder = data.parentFolder || data.parentFolderId || data.folderId || null;

  if (status !== 'ok' || !downloadPage) {
    const message = data?.error || data?.message || body?.error || body?.message || body?.status || 'Unknown GoFile upload error';
    const err = new Error(`GoFile upload failed: ${message}`);
    err.responseBody = body;
    throw err;
  }

  return {
    ok: true,
    provider: 'GoFile',
    downloadPage: String(downloadPage),
    directLink: directLink && /^https?:\/\//i.test(String(directLink)) ? String(directLink) : null,
    code: code ? String(code) : null,
    fileId: fileId ? String(fileId) : null,
    parentFolder: parentFolder ? String(parentFolder) : null,
    guestToken: data.guestToken ? String(data.guestToken) : null,
    filename: data.fileName || data.filename || null,
    size: Number.isFinite(Number(data.size)) ? Number(data.size) : null,
    server: data.server || null,
  };
}

async function uploadFile(filePath, options = {}) {
  const absolutePath = path.resolve(filePath);
  const stat = await fs.promises.stat(absolutePath);
  if (!stat.isFile()) throw new Error('Upload target is not a regular file.');
  if (stat.size <= 0) throw new Error('The selected file is empty.');
  if (stat.size > MAX_BYTES) {
    throw new Error(`File is too large for -gofileup. Maximum is ${formatBytes(MAX_BYTES)}.`);
  }

  const filename = safeFilename(options.filename || path.basename(absolutePath));
  const form = new FormData();
  form.append('file', fs.createReadStream(absolutePath), {
    filename,
    knownLength: stat.size,
    contentType: options.contentType || 'application/octet-stream'
  });

  const headers = {
    ...form.getHeaders(),
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*'
  };

  // Optional account token. Guest uploads work without it.
  const token = String(
    process.env.GOFILE_API_TOKEN ||
    process.env.GOFILE_PREMIUM_TOKEN ||
    ''
  ).trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await axios.post(UPLOAD_ENDPOINT, form, {
    headers,
    timeout: TIMEOUT_MS,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: () => true
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`GoFile upload failed: HTTP ${response.status}`);
  }

  return normalizeUploadResponse(response.data);
}

module.exports = {
  uploadFile,
  formatBytes,
  safeFilename,
  MAX_BYTES
};
