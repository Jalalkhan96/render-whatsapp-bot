'use strict';

const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';
const TIMEOUT_MS = Math.max(30_000, Number(process.env.DROPBOX_UPLOAD_TIMEOUT_MS || 30 * 60 * 1000));
const MAX_BYTES = Math.max(1, Number(process.env.DROPBOXUP_MAX_MB || 500)) * 1024 * 1024;
const CHUNK_BYTES = 8 * 1024 * 1024; // keep each request comfortably under Dropbox's 150 MiB limit
const USER_AGENT = 'ABIX-AE-DropboxUploader/1.0';

let cachedToken = '';
let tokenExpiresAt = 0;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(i ? 2 : 0)} ${units[i]}`;
}

function safeFilename(name, fallback = 'abix-upload.bin') {
  const base = path.basename(String(name || '').trim());
  const cleaned = base.replace(/[\u0000-\u001F<>:"/\\|?*]+/g, '_').replace(/\s+/g, ' ').trim();
  return (cleaned || fallback).slice(0, 180);
}

function jsonHeader(value) {
  // Dropbox requires non-ASCII characters in Dropbox-API-Arg to be escaped.
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function errorText(error) {
  const data = error?.response?.data;
  if (typeof data === 'string') return data.slice(0, 260);
  return String(data?.error_summary || data?.error?.['.tag'] || data?.error || error?.message || 'Unknown Dropbox API error').slice(0, 260);
}

function requestHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT };
}

async function getAccessToken() {
  const direct = String(process.env.DROPBOX_ACCESS_TOKEN || '').trim();
  if (direct) return direct;

  const appKey = String(process.env.DROPBOX_APP_KEY || '').trim();
  const appSecret = String(process.env.DROPBOX_APP_SECRET || '').trim();
  const refreshToken = String(process.env.DROPBOX_REFRESH_TOKEN || '').trim();
  if (!appKey || !appSecret || !refreshToken) {
    throw new Error('Dropbox is not configured. Set DROPBOX_ACCESS_TOKEN or all of DROPBOX_APP_KEY, DROPBOX_APP_SECRET, and DROPBOX_REFRESH_TOKEN.');
  }
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  try {
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
    const response = await axios.post('https://api.dropbox.com/oauth2/token', body.toString(), {
      headers: {
        Authorization: `Basic ${Buffer.from(`${appKey}:${appSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      timeout: 20_000,
    });
    const token = String(response.data?.access_token || '').trim();
    if (!token) throw new Error('Dropbox token endpoint returned no access_token.');
    cachedToken = token;
    tokenExpiresAt = Date.now() + Math.max(60, Number(response.data?.expires_in) || 14_000) * 1000;
    return cachedToken;
  } catch (error) {
    throw new Error(`Could not refresh Dropbox access token: ${errorText(error)}`);
  }
}

async function rpc(token, endpoint, body) {
  try {
    const response = await axios.post(`${API}/${endpoint}`, body, {
      headers: { ...requestHeaders(token), 'Content-Type': 'application/json' },
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) {
      const error = new Error(`Dropbox ${endpoint} failed (HTTP ${response.status}): ${errorText({ response })}`);
      error.status = response.status;
      error.data = response.data;
      throw error;
    }
    return response.data;
  } catch (error) {
    if (error.status) throw error;
    throw new Error(`Dropbox ${endpoint} request failed: ${errorText(error)}`);
  }
}

async function ensureFolder(token, folder) {
  const clean = String(folder || '').trim().replace(/\\/g, '/').replace(/\/+$/g, '');
  if (!clean || clean === '/') return '';
  const target = clean.startsWith('/') ? clean : `/${clean}`;
  try {
    await rpc(token, 'files/create_folder_v2', { path: target, autorename: false });
  } catch (error) {
    // Dropbox returns path/conflict/folder when the folder already exists.
    const detail = String(error.message || '').toLowerCase();
    const tag = String(error.data?.error?.['.tag'] || '').toLowerCase();
    const nestedTag = String(error.data?.error?.path?.['.tag'] || '').toLowerCase();
    if (!(error.status === 409 && (detail.includes('conflict') || tag === 'path' || nestedTag === 'conflict'))) throw error;
  }
  return target;
}

function uploadArg(targetPath) {
  return { path: targetPath, mode: 'add', autorename: true, mute: false, strict_conflict: false };
}

async function uploadSmall(token, filePath, targetPath, size) {
  const arg = uploadArg(targetPath);
  try {
    const response = await axios.post(`${CONTENT}/files/upload`, fs.createReadStream(filePath), {
      headers: {
        ...requestHeaders(token),
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(size),
        'Dropbox-API-Arg': jsonHeader(arg),
      },
      timeout: TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Dropbox upload failed (HTTP ${response.status}): ${errorText({ response })}`);
    }
    return response.data;
  } catch (error) {
    throw new Error(error.message || 'Dropbox file upload failed.');
  }
}

async function readChunk(handle, length, position) {
  const buffer = Buffer.allocUnsafe(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

async function postContent(token, endpoint, bytes, arg) {
  const response = await axios.post(`${CONTENT}/${endpoint}`, bytes, {
    headers: {
      ...requestHeaders(token),
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'Dropbox-API-Arg': jsonHeader(arg),
    },
    timeout: TIMEOUT_MS,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    validateStatus: () => true,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Dropbox ${endpoint} failed (HTTP ${response.status}): ${errorText({ response })}`);
  }
  return response.data;
}

async function uploadLarge(token, filePath, targetPath, size) {
  const handle = await fs.promises.open(filePath, 'r');
  let sessionId = '';
  try {
    const first = await readChunk(handle, Math.min(CHUNK_BYTES, size), 0);
    const started = await postContent(token, 'files/upload_session/start', first, { close: false });
    sessionId = String(started?.session_id || '');
    if (!sessionId) throw new Error('Dropbox did not return an upload session ID.');
    let offset = first.length;

    while (offset < size) {
      const chunk = await readChunk(handle, Math.min(CHUNK_BYTES, size - offset), offset);
      if (!chunk.length) throw new Error('Unexpected end of file while reading Dropbox upload chunks.');
      const nextOffset = offset + chunk.length;
      if (nextOffset < size) {
        await postContent(token, 'files/upload_session/append_v2', chunk, {
          cursor: { session_id: sessionId, offset }, close: false,
        });
      } else {
        return await postContent(token, 'files/upload_session/finish', chunk, {
          cursor: { session_id: sessionId, offset },
          commit: uploadArg(targetPath),
        });
      }
      offset = nextOffset;
    }
    throw new Error('Dropbox upload session ended before the final chunk.');
  } finally {
    await handle.close().catch(() => {});
  }
}

async function createSharedLink(token, pathValue) {
  try {
    const result = await rpc(token, 'sharing/create_shared_link_with_settings', {
      path: pathValue,
      settings: { requested_visibility: 'public' },
    });
    return result?.url || null;
  } catch (error) {
    const errorString = String(error.message || '').toLowerCase();
    const tag = String(error.data?.error?.['.tag'] || '').toLowerCase();
    if (error.status !== 409 && !errorString.includes('shared_link_already_exists') && tag !== 'shared_link_already_exists') throw error;
    const existing = await rpc(token, 'sharing/list_shared_links', { path: pathValue, direct_only: true });
    const link = existing?.links?.[0]?.url;
    if (!link) throw new Error('Dropbox uploaded the file, but no share link could be created. Check the app sharing.write permission.');
    return link;
  }
}

async function uploadFile(filePath, options = {}) {
  const absolutePath = path.resolve(filePath);
  const stat = await fs.promises.stat(absolutePath);
  if (!stat.isFile()) throw new Error('Upload target is not a regular file.');
  if (stat.size <= 0) throw new Error('The selected file is empty.');
  if (stat.size > MAX_BYTES) throw new Error(`File is too large for -dropboxup. Maximum is ${formatBytes(MAX_BYTES)}.`);

  const token = await getAccessToken();
  const folder = await ensureFolder(token, process.env.DROPBOX_UPLOAD_FOLDER || '');
  const filename = safeFilename(options.filename || path.basename(absolutePath));
  const targetPath = `${folder}/${filename}`.replace(/\/+/g, '/');
  const metadata = stat.size <= 150 * 1024 * 1024
    ? await uploadSmall(token, absolutePath, targetPath, stat.size)
    : await uploadLarge(token, absolutePath, targetPath, stat.size);
  const sharedLink = await createSharedLink(token, metadata?.path_lower || metadata?.path_display || targetPath);
  if (!sharedLink) throw new Error('Dropbox uploaded the file but did not return a share link.');
  return {
    ok: true,
    provider: 'Dropbox',
    filename: metadata?.name || filename,
    path: metadata?.path_display || targetPath,
    size: Number(metadata?.size || stat.size),
    sharedLink,
    directLink: sharedLink.replace(/[?&]dl=0\b/, match => match[0] === '?' ? '?dl=1' : '&dl=1'),
    id: metadata?.id || null,
  };
}

module.exports = { uploadFile, getAccessToken, formatBytes, safeFilename, MAX_BYTES, CHUNK_BYTES };
