'use strict';
/**
 * File delivery helpers — mirrors how MovieBox+ actually moves bytes:
 *
 *  1. GSLB: POST {gslb}/gslb/domain/convert  -> best CDN domain per country
 *     (app sends X-Gslb-Sign header; GslbSdk v1.0.3.2)
 *  2. DCDN: {dcdnApi} + getDcdnUrl()          -> signed, expiring media URLs
 *  3. STREAM: play-info endpoint              -> stream URLs, played via ExoPlayer
 *     (+ danikula AndroidVideoCache local proxy on device)
 *  4. DOWNLOAD: start-download-resource -> fetch file -> finish-download-resource
 *     (on Android this lands in DownloadManager + FileProvider)
 *  5. UPLOAD: /wefeed-mobile-bff/upload/sts-token/v2 -> temp STS creds -> direct PUT to object storage
 */
const { HOSTS, SUBJECT, UGC } = require('./config.cjs');

async function gslbDomainConvert(c, body = {}, { baseUrl } = {}) {
  return c.post('/gslb/domain/convert', body, { baseUrl: baseUrl || HOSTS.gslb });
}

/** Offline-download handshake for a movie/TV subject. Returns the resource, caller downloads the file URL, then finishes. */
async function downloadSubjectResource(c, params = {}) {
  const resource = await c.post(SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_START_DOWNLOAD_RESOURCE, params);
  return {
    resource,
    /** Call after the file bytes are saved locally. */
    finish: (finishParams = {}) =>
      c.post(SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_FINISH_DOWNLOAD_RESOURCE, { ...params, ...finishParams }),
  };
}

/** Offline-download handshake for a UGC video. */
async function downloadUgcVideo(c, params = {}) {
  const resource = await c.post(UGC.WEFEED_MOBILE_BFF_UGC_VIDEO_START_DOWNLOAD, params);
  return {
    resource,
    finish: (finishParams = {}) =>
      c.post(UGC.WEFEED_MOBILE_BFF_UGC_VIDEO_FINISH_DOWNLOAD, { ...params, ...finishParams }),
  };
}

/** Get a temporary STS credential for direct upload to object storage. */
async function uploadStsToken(c, params = {}) {
  return c.post('/wefeed-mobile-bff/upload/sts-token/v2', params);
}

/** Download a file URL to disk with resume support (Range). Zero-dep. */
async function downloadFile(url, destPath, { headers = {}, onProgress } = {}) {
  const fs = require('fs');
  let start = 0;
  if (fs.existsSync(destPath)) start = fs.statSync(destPath).size;
  const res = await fetch(url, {
    headers: { ...headers, ...(start > 0 ? { Range: `bytes=${start}-` } : {}) },
  });
  if (!res.ok && res.status !== 206) throw new Error(`download HTTP ${res.status} for ${url}`);
  const total = Number(res.headers.get('content-length') || 0) + start;
  const fh = fs.openSync(destPath, start > 0 ? 'a' : 'w');
  let done = start;
  try {
    for await (const chunk of res.body) {
      fs.writeSync(fh, chunk);
      done += chunk.length;
      if (onProgress) onProgress(done, total);
    }
  } finally {
    fs.closeSync(fh);
  }
  return { path: destPath, bytes: done };
}

module.exports = {
  gslbDomainConvert,
  downloadSubjectResource,
  downloadUgcVideo,
  uploadStsToken,
  downloadFile,
  CDN: {
    video: HOSTS.video,           // https://v.aoneroom.com
    image: HOSTS.imageCdn,        // https://pacdn.aoneroom.com
    palm: HOSTS.palmCdn,          // https://cdn2.palmplaystore.com
    dcdnApi: HOSTS.dcdnApi,       // https://dcdn-api.hisavana.com
    gslb: HOSTS.gslb,             // https://gslb.shalltry.com
  },
};
