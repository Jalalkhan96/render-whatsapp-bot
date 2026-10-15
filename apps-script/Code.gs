/**
 * APIFY SOCIAL GATEWAY v2
 *
 * Bot -> Google Apps Script -> Apify Actor -> Dataset items -> Bot
 *
 * Put all Apify tokens in Script Properties.
 * The bot only sends:
 *   secret
 *   op
 *   input
 *
 * The server chooses the Actor from a whitelist.
 *
 * NOTE:
 * Multiple tokens from the same Apify account are NOT treated as extra
 * account-level quota. Rotation here is credential failover/resilience.
 */

const CONFIG = {
  MAX_TOKEN_SLOTS: 15,
  KEY_COOLDOWN_MS: 5 * 60 * 1000,
  MAX_ATTEMPTS: 15,
  ACTORS: {
    'tiktok.search': 'clockworks/tiktok-scraper',
    'tiktok.comments': 'clockworks/tiktok-comments-scraper',
    'tiktok.profile': 'clockworks/tiktok-profile-scraper',
    'tiktok.hashtag': 'clockworks/tiktok-hashtag-scraper',
    'tiktok.video': 'clockworks/tiktok-video-scraper',

    'instagram.all': 'apify/instagram-scraper',
    'instagram.search': 'apify/instagram-search-scraper',
    'instagram.profile': 'apify/instagram-profile-scraper',
    'instagram.comments': 'apify/instagram-comment-scraper',
    'instagram.hashtag': 'apify/instagram-search-scraper',

    'facebook.search': 'apify/facebook-search-scraper',
    'facebook.posts': 'apify/facebook-posts-scraper',
    'facebook.comments': 'apify/facebook-comments-scraper',

    'reddit.all': 'hipersoft/reddit-scraper',

    'pinterest.all': 'subimpact/pinterest-scraper',

    'youtube.all': 'automation-lab/youtube-scraper',

    'x.all': 'forge-api/x-scraper',

    'linkedin.people': 'harvestapi/linkedin-profile-search',
    'linkedin.posts': 'apimaestro/linkedin-profile-posts',
    'linkedin.jobs': 'bebity/linkedin-jobs-scraper',

    'threads.all': 'lergassy/threads-scraper',

    'snapchat.profile': 'automation-lab/snapchat-scraper'
  }
};

function doGet(e) {
  return response_({
    success: false,
    error: 'Use POST for the gateway. GET is disabled so secrets are not placed in URLs.'
  });
}

function doPost(e) {
  try {
    const body = parseJsonBody_(e);

    verifySecret_(body.secret);

    const op = String(body.op || '').trim();
    if (!CONFIG.ACTORS[op]) {
      return response_({
        success: false,
        error: 'Unsupported operation: ' + op
      });
    }

    let input = body.input;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return response_({
        success: false,
        error: 'input must be a JSON object'
      });
    }

    // Basic request limits. Keep the gateway cheap.
    input = clampCommonInput_(input);

    const result = runApifyWithFailover_(CONFIG.ACTORS[op], op, input);

    return response_({
      success: true,
      op,
      actor: CONFIG.ACTORS[op],
      runId: result.runId,
      datasetId: result.datasetId,
      tokenSlot: result.tokenSlot,
      items: result.items
    });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);

    return response_({
      success: false,
      error: safeError_(err)
    });
  }
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Missing POST body.');
  }

  const type = String(e.postData.type || '').toLowerCase();

  if (type.indexOf('application/json') < 0) {
    throw new Error('Content-Type must be application/json.');
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (_) {
    throw new Error('Invalid JSON body.');
  }
}

function verifySecret_(provided) {
  const expected = PropertiesService
    .getScriptProperties()
    .getProperty('GATEWAY_SECRET');

  if (!expected) {
    throw new Error('GATEWAY_SECRET is not configured.');
  }

  if (!provided || provided !== expected) {
    const err = new Error('Unauthorized gateway request.');
    err.status = 401;
    throw err;
  }
}

function runApifyWithFailover_(actorId, op, input) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const tokens = loadTokens_();

    if (!tokens.length) {
      throw new Error('No APIFY_TOKEN_01..APIFY_TOKEN_15 configured.');
    }

    const ordered = rotateByLastSuccessful_(tokens);
    let lastError = null;

    for (let i = 0; i < Math.min(CONFIG.MAX_ATTEMPTS, ordered.length); i++) {
      const entry = ordered[i];

      if (cooling_(entry.name)) {
        continue;
      }

      try {
        const result = apifySync_(actorId, entry.token, input);

        setProperty_('APIFY_LAST_SLOT', String(entry.index));

        return {
          runId: result.runId,
          datasetId: result.datasetId,
          items: result.items,
          tokenSlot: entry.index
        };
      } catch (err) {
        lastError = err;

        if (err.status === 401 || err.status === 403) {
          // Token itself may be unusable for this call.
          cooldown_(entry.name, CONFIG.KEY_COOLDOWN_MS);
          continue;
        }

        if (err.status === 429) {
          // Retry the same credential after a bounded wait.
          const retryMs = Math.min(err.retryAfterMs || 5000, 20000);
          Utilities.sleep(retryMs);

          try {
            const retry = apifySync_(actorId, entry.token, input);
            setProperty_('APIFY_LAST_SLOT', String(entry.index));

            return {
              runId: retry.runId,
              datasetId: retry.datasetId,
              items: retry.items,
              tokenSlot: entry.index
            };
          } catch (retryErr) {
            lastError = retryErr;
            break;
          }
        }

        cooldown_(entry.name, CONFIG.KEY_COOLDOWN_MS);
      }
    }

    throw lastError || new Error('All configured credentials failed.');
  } finally {
    lock.releaseLock();
  }
}

function apifySync_(actorId, token, input) {
  const url =
    'https://api.apify.com/v2/acts/' +
    encodeURIComponent(actorId).replace('%7E', '~') +
    '/run-sync-get-dataset-items';

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(input),
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const raw = response.getContentText();

  if (status >= 200 && status < 300) {
    return parseSyncResult_(raw);
  }

  const err = new Error(
    'Apify HTTP ' + status + ': ' + raw.slice(0, 700)
  );
  err.status = status;

  const headers = response.getHeaders();
  const retryAfter = Number(headers['Retry-After']);

  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    err.retryAfterMs = retryAfter * 1000;
  }

  throw err;
}

function parseSyncResult_(raw) {
  if (!raw) {
    return {
      runId: null,
      datasetId: null,
      items: []
    };
  }

  let data;

  try {
    data = JSON.parse(raw);
  } catch (_) {
    throw new Error('Apify returned invalid JSON.');
  }

  /*
   * run-sync-get-dataset-items normally returns the dataset item array.
   * Keep tolerant handling for Actor/schema wrappers.
   */
  if (Array.isArray(data)) {
    return {
      runId: null,
      datasetId: null,
      items: data
    };
  }

  return {
    runId: data.runId || data.id || null,
    datasetId: data.datasetId || data.defaultDatasetId || null,
    items:
      Array.isArray(data.items) ? data.items :
      Array.isArray(data.data) ? data.data :
      data.data && Array.isArray(data.data.items) ? data.data.items :
      []
  };
}

function clampCommonInput_(input) {
  const copy = JSON.parse(JSON.stringify(input));

  if (typeof copy.maxResults === 'number') {
    copy.maxResults = Math.min(100, Math.max(1, Math.floor(copy.maxResults)));
  }

  if (typeof copy.maxItems === 'number') {
    copy.maxItems = Math.min(100, Math.max(1, Math.floor(copy.maxItems)));
  }

  if (typeof copy.resultsPerPage === 'number') {
    copy.resultsPerPage = Math.min(100, Math.max(1, Math.floor(copy.resultsPerPage)));
  }

  if (typeof copy.searchLimit === 'number') {
    copy.searchLimit = Math.min(250, Math.max(1, Math.floor(copy.searchLimit)));
  }

  if (typeof copy.maxComments === 'number') {
    copy.maxComments = Math.min(200, Math.max(0, Math.floor(copy.maxComments)));
  }

  if (typeof copy.commentsPerPost === 'number') {
    copy.commentsPerPost = Math.min(200, Math.max(0, Math.floor(copy.commentsPerPost)));
  }

  return copy;
}

function loadTokens_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const out = [];

  for (let i = 1; i <= CONFIG.MAX_TOKEN_SLOTS; i++) {
    const suffix = String(i).padStart(2, '0');
    const name = 'APIFY_TOKEN_' + suffix;
    const token = String(props[name] || '').trim();

    if (token) {
      out.push({
        index: i,
        name,
        token
      });
    }
  }

  return out;
}

function rotateByLastSuccessful_(tokens) {
  const last = Number(
    PropertiesService.getScriptProperties().getProperty('APIFY_LAST_SLOT') || '0'
  );

  if (!Number.isFinite(last) || last <= 0) {
    return tokens;
  }

  const index = tokens.findIndex(function(item) {
    return item.index > last;
  });

  if (index < 0) {
    return tokens;
  }

  return tokens.slice(index).concat(tokens.slice(0, index));
}

function cooling_(name) {
  const value = Number(
    PropertiesService.getScriptProperties().getProperty('COOLDOWN_' + name) || '0'
  );

  return Number.isFinite(value) && value > Date.now();
}

function cooldown_(name, ms) {
  PropertiesService
    .getScriptProperties()
    .setProperty(
      'COOLDOWN_' + name,
      String(Date.now() + Math.max(1000, ms))
    );
}

function setProperty_(name, value) {
  PropertiesService
    .getScriptProperties()
    .setProperty(name, String(value));
}

function safeError_(err) {
  if (!err) return 'Unknown error';
  if (err.status === 401) return 'Unauthorized.';
  if (err.status === 429) return 'Apify rate limit reached. Retry later.';

  return String(err.message || err)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .slice(0, 1000);
}

function response_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function testConfiguration() {
  const props = PropertiesService.getScriptProperties();
  const tokens = loadTokens_();

  if (!props.getProperty('GATEWAY_SECRET')) {
    throw new Error('Missing GATEWAY_SECRET.');
  }

  if (!tokens.length) {
    throw new Error('No APIFY_TOKEN_01..APIFY_TOKEN_15.');
  }

  console.log(
    'Configured slots: ' +
    tokens.map(function(x) { return x.name; }).join(', ')
  );

  console.log(
    'Whitelisted operations: ' +
    Object.keys(CONFIG.ACTORS).join(', ')
  );
}
