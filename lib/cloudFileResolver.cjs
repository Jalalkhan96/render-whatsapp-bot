"use strict";

const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");

const UA = process.env.GOFILE_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const GOFILE_LANGUAGE = process.env.GOFILE_LANGUAGE || "en-US";
// GoFile's current website-token salt. Override with GOFILE_WT_SALT if GoFile rotates it.
const GOFILE_WT_SALT = process.env.GOFILE_WT_SALT || "12af056dacea0b";
const GOFILE_WT_WINDOW_SECONDS = 14400;
const HTTP_TIMEOUT = Number(process.env.CLOUD_FILE_RESOLVE_TIMEOUT_MS || 45000);
const GOFILE_MAX_RETRIES = Number(process.env.GOFILE_MAX_RETRIES || 3);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanUrl(input) {
  const value = String(input || "").trim();
  if (!/^https?:\/\//i.test(value)) throw new Error("Only HTTP/HTTPS links are supported.");
  return value;
}

function hostOf(input) {
  try { return new URL(input).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return ""; }
}

function isHost(host, ...names) {
  return names.some((name) => host === name || host.endsWith(`.${name}`));
}

function providerForUrl(input) {
  const url = cleanUrl(input);
  const host = hostOf(url);

  if (isHost(host, "drive.google.com", "drive.usercontent.google.com")) return "Google Drive";
  if (isHost(host, "dropbox.com", "dropboxusercontent.com")) return "Dropbox";
  if (isHost(host, "gofile.io")) return "GoFile";
  if (isHost(host, "mediafire.com")) return "MediaFire";
  if (isHost(host, "pixeldrain.com")) return "Pixeldrain";
  if (isHost(host, "github.com", "githubusercontent.com")) return "GitHub";
  return "Direct file URL";
}

function safeFilename(name, fallback = "download.bin") {
  let value = String(name || fallback)
    .split(/[\\/]/).pop()
    .replace(/[\x00-\x1f<>:"|?*]/g, "_")
    .trim();
  if (!value || value === "." || value === "..") value = fallback;
  return value.slice(0, 180);
}

function filenameFromHeaders(headers) {
  const disposition = headers?.["content-disposition"] || headers?.["Content-Disposition"];
  if (!disposition) return null;
  const utf8 = String(disposition).match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try { return safeFilename(decodeURIComponent(utf8[1])); } catch {}
  }
  const normal = String(disposition).match(/filename="?([^";]+)"?/i);
  return normal ? safeFilename(normal[1]) : null;
}

function filenameFromUrl(input) {
  try {
    const u = new URL(input);
    const name = decodeURIComponent(u.pathname.split("/").pop() || "");
    return name ? safeFilename(name) : null;
  } catch { return null; }
}

function googleDriveId(input) {
  const u = new URL(input);
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/
  ];
  for (const pattern of patterns) {
    const match = u.href.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function resolveGoogleDrive(input) {
  const id = googleDriveId(input);
  if (!id) throw new Error("Google Drive file ID could not be extracted from this link.");

  const direct = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
  let filename = null;
  try {
    const meta = await axios.get(`https://drive.google.com/file/d/${encodeURIComponent(id)}/view`, {
      timeout: HTTP_TIMEOUT,
      maxContentLength: 2 * 1024 * 1024,
      responseType: "text",
      headers: { "User-Agent": UA, Accept: "text/html,*/*" }
    });
    const html = String(meta.data || "");
    const m1 = html.match(/<title>([^<]+)<\/title>/i);
    if (m1?.[1]) filename = safeFilename(m1[1].replace(/\s+-\s+Google Drive$/i, ""));
    const m2 = html.match(/"name":"([^\"]+)"/i);
    if (m2?.[1]) filename = safeFilename(m2[1]);
  } catch {}
  return { provider: "Google Drive", url: direct, filename };
}

async function resolveDropbox(input) {
  const u = new URL(input);
  u.searchParams.set("dl", "1");
  u.searchParams.delete("raw");
  return { provider: "Dropbox", url: u.toString(), filename: filenameFromUrl(u.toString()) };
}

function extractGofileId(input) {
  const u = new URL(input);
  const match = u.pathname.match(/\/d\/([^/?#]+)/i) || u.pathname.match(/\/contents\/([^/?#]+)/i);
  return match?.[1] || null;
}

async function createGofileGuestToken() {
  try {
    const response = await axios.post("https://api.gofile.io/accounts", null, {
      timeout: HTTP_TIMEOUT,
      maxContentLength: 512 * 1024,
      headers: {
        "User-Agent": UA,
        "Accept": "application/json",
        "Origin": "https://gofile.io",
        "Referer": "https://gofile.io/"
      },
      validateStatus: s => s >= 200 && s < 500
    });
    const token = response.data?.data?.token || response.data?.token;
    if (token) return String(token);
    throw new Error(`GoFile guest token creation failed (${response.status}): ${JSON.stringify(response.data)?.slice(0, 300)}`);
  } catch (error) {
    if (error?.response?.data) {
      throw new Error(`GoFile guest token creation failed (${error.response.status}): ${JSON.stringify(error.response.data).slice(0, 300)}`);
    }
    throw new Error(`GoFile guest token creation failed: ${error?.message || error}`);
  }
}

function generateGofileWebsiteToken(accountToken, windowOffset = 0, salt = GOFILE_WT_SALT) {
  const window = Math.floor(Date.now() / 1000 / GOFILE_WT_WINDOW_SECONDS) + windowOffset;
  const raw = `${UA}::${GOFILE_LANGUAGE}::${accountToken}::${window}::${salt}`;
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

function gofileHeaders(accountToken, windowOffset = 0) {
  return {
    "User-Agent": UA,
    "Accept": "*/*",
    "Accept-Language": `${GOFILE_LANGUAGE},en;q=0.9`,
    "Authorization": `Bearer ${accountToken}`,
    "X-Website-Token": generateGofileWebsiteToken(accountToken, windowOffset),
    "X-BL": GOFILE_LANGUAGE,
    "Origin": "https://gofile.io",
    "Referer": "https://gofile.io/"
  };
}

function normalizeGofileFile(item) {
  if (!item || item.type === "folder") return null;
  const direct = item.link || item.directLink || item.downloadUrl || item.url;
  if (!direct || !/^https?:\/\//i.test(String(direct))) return null;
  return {
    provider: "GoFile",
    url: String(direct),
    filename: safeFilename(item.name || filenameFromUrl(direct) || "gofile-download.bin"),
    size: Number.isFinite(Number(item.size)) ? Number(item.size) : null,
    contentType: item.mimetype || item.mimeType || null,
    requestHeaders: {
      "User-Agent": UA,
      "Accept": "*/*",
      "Referer": "https://gofile.io/"
    }
  };
}

function extractChildren(data) {
  const children = data?.children || data?.contents || {};
  if (Array.isArray(children)) return children;
  if (children && typeof children === "object") return Object.values(children);
  return [];
}

function gofileError(status, payload) {
  const code = payload?.status || `http-${status}`;
  const messages = {
    "error-notFound": "GoFile says this public link was not found. It may be deleted, expired, or no longer public.",
    "error-notPremium": "GoFile rejected the website token. The token algorithm/salt may have changed.",
    "error-rateLimit": "GoFile rate-limited the request. Please retry after a short wait.",
    "error-auth": "GoFile rejected the access token.",
    "error-password": "This GoFile item is password protected. Password support is not enabled in this command yet."
  };
  const err = new Error(messages[code] || `GoFile API error: ${code}`);
  err.code = code;
  err.httpStatus = status;
  return err;
}

async function resolveGoFile(input) {
  const id = extractGofileId(input);
  if (!id) throw new Error("GoFile share code could not be extracted from this link.");

  const token = process.env.GOFILE_PREMIUM_TOKEN || await createGofileGuestToken();
  const offsets = [0, -1];
  let lastError = null;

  for (let retry = 0; retry <= GOFILE_MAX_RETRIES; retry++) {
    const windowOffset = offsets[Math.min(retry, offsets.length - 1)];
    try {
      const response = await axios.get(`https://api.gofile.io/contents/${encodeURIComponent(id)}`, {
        timeout: HTTP_TIMEOUT,
        maxContentLength: 8 * 1024 * 1024,
        params: {
          contentFilter: "",
          page: 1,
          pageSize: 1000,
          sortField: "createTime",
          sortDirection: -1
        },
        headers: gofileHeaders(token, windowOffset),
        validateStatus: s => s >= 200 && s < 500
      });

      const payload = response.data || {};
      if (response.status < 200 || response.status >= 300) {
        throw gofileError(response.status, payload);
      }
      if (payload.status && payload.status !== "ok") {
        throw gofileError(response.status, payload);
      }

      const data = payload.data || {};
      const direct = normalizeGofileFile(data);
      if (direct) return direct;

      const children = extractChildren(data);
      const firstFile = children.map(normalizeGofileFile).find(Boolean);
      if (firstFile) return firstFile;

      if (data.type === "folder") {
        throw new Error("This GoFile link points to a folder. The current command accepts a single public file link.");
      }
      throw new Error("GoFile returned the content but no downloadable file URL was exposed.");
    } catch (error) {
      lastError = error;
      const code = error?.code || "";
      if (code === "error-notFound" || code === "error-auth") break;
      if (code === "error-rateLimit") {
        if (retry < GOFILE_MAX_RETRIES) await sleep(2000 * (retry + 1));
        continue;
      }
      if (code === "error-notPremium" && retry === 0) continue;
      if (retry < GOFILE_MAX_RETRIES && (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT" || /timeout/i.test(error?.message || ""))) {
        await sleep(1200 * (retry + 1));
        continue;
      }
      break;
    }
  }

  if (lastError?.code === "error-notPremium") {
    throw new Error(`${lastError.message} Set GOFILE_WT_SALT to the current GoFile salt and restart the bot.`);
  }
  throw lastError || new Error("GoFile resolution failed.");
}

async function resolveMediaFire(input) {
  const response = await axios.get(input, {
    timeout: HTTP_TIMEOUT,
    maxContentLength: 6 * 1024 * 1024,
    responseType: "text",
    headers: { "User-Agent": UA, Accept: "text/html,*/*" }
  });
  const $ = cheerio.load(response.data || "");
  const link = $("#downloadButton").attr("href") || $("a[aria-label*='Download']").attr("href");
  if (!link || !/^https?:\/\//i.test(link)) throw new Error("MediaFire public download link could not be resolved.");
  const name = $("div.dl-info > div.promo-text").text().trim() || $(".dl-btn-label").attr("title") || filenameFromUrl(link);
  return { provider: "MediaFire", url: link, filename: safeFilename(name || "mediafire-download.bin") };
}

function extractPixeldrainId(input) {
  const u = new URL(input);
  const match = u.pathname.match(/\/u\/([A-Za-z0-9_-]+)/i) || u.pathname.match(/\/api\/file\/([A-Za-z0-9_-]+)/i) || u.pathname.match(/\/l\/([A-Za-z0-9_-]+)/i);
  return match?.[1] || null;
}

async function resolvePixeldrain(input) {
  const id = extractPixeldrainId(input);
  if (!id) throw new Error("Pixeldrain file ID could not be extracted from this link.");
  let filename = null, size = null, contentType = null;
  try {
    const info = await axios.get(`https://pixeldrain.com/api/file/${encodeURIComponent(id)}`, {
      timeout: HTTP_TIMEOUT,
      maxContentLength: 2 * 1024 * 1024,
      headers: { "User-Agent": UA, Accept: "application/json" }
    });
    filename = info.data?.name || null;
    size = Number(info.data?.size || 0) || null;
    contentType = info.data?.mime_type || info.data?.mimeType || null;
  } catch {}
  return { provider: "Pixeldrain", url: `https://pixeldrain.com/api/file/${encodeURIComponent(id)}`, filename: safeFilename(filename || `pixeldrain-${id}.bin`), size, contentType };
}

async function resolveGitHub(input) {
  const u = new URL(input);
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length >= 5 && parts[2] === "releases" && parts[3] === "download") return { provider: "GitHub", url: input, filename: filenameFromUrl(input) };
  throw new Error("GitHub support here is for direct release assets. Use the existing GitHub release command for release-page URLs.");
}

async function resolveCloudFile(input) {
  const url = cleanUrl(input);
  switch (providerForUrl(url)) {
    case "Google Drive": return resolveGoogleDrive(url);
    case "Dropbox": return resolveDropbox(url);
    case "GoFile": return resolveGoFile(url);
    case "MediaFire": return resolveMediaFire(url);
    case "Pixeldrain": return resolvePixeldrain(url);
    case "GitHub": return resolveGitHub(url);
    default: return { provider: "Direct file URL", url, filename: filenameFromUrl(url) };
  }
}

module.exports = {
  providerForUrl,
  resolveCloudFile,
  filenameFromHeaders,
  filenameFromUrl,
  safeFilename,
  generateGofileWebsiteToken
};
