const rotator = require("./apifyRotator");

const COOLDOWNS = {
  RATE_LIMIT: 60 * 1000, // 429 — short, retry soon
  MONTHLY_CAP: 24 * 60 * 60 * 1000, // usage cap — retry next day (tune to your billing reset)
  TIMEOUT: 30 * 1000, // transient network timeout
  SERVER_ERROR: 15 * 1000,
};

const REQUEST_TIMEOUT_MS = 90 * 1000; // scrapers can be slow; give more room than a generic API call

function classifyError(err) {
  const status = err?.response?.status || err?.statusCode || err?.status;
  const errType = err?.response?.data?.error?.type || err?.data?.error?.type || "";
  const message = err?.message || "";

  if (err.name === "AbortError" || /timeout/i.test(message)) {
    return { kind: "TIMEOUT" };
  }
  if (status === 429 || /rate-?limit/i.test(errType)) {
    return { kind: "RATE_LIMIT" };
  }
  if (status === 402 || /usage-hard-limit|monthly-usage|quota/i.test(errType)) {
    return { kind: "MONTHLY_CAP" };
  }
  if (status === 401 || /invalid-?token|unauthorized/i.test(errType)) {
    return { kind: "INVALID_TOKEN" };
  }
  if (status === 404) {
    return { kind: "ACTOR_NOT_FOUND" };
  }
  if (status >= 500) {
    return { kind: "APIFY_SERVER_ERROR" };
  }
  if (!status && /network|fetch failed|ECONNRESET|ENOTFOUND/i.test(message)) {
    return { kind: "NETWORK_ERROR" };
  }
  return { kind: "UNKNOWN" };
}

async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * callApify(runFn, opts)
 * runFn: async (token) => result — perform the actual fetch using this token.
 * Rotates across all configured keys on retryable failures; logs every step.
 */
async function callApify(runFn, opts = {}) {
  const maxAttempts = opts.maxAttempts || rotator.tokens.length;
  const label = opts.label || "apify-call";
  const errors = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const entry = rotator.getNextAvailable();

    if (!entry) {
      console.error(`[apify-client:${label}] All ${rotator.tokens.length} keys are on cooldown.`, rotator.status());
      const err = new Error("All Apify keys are exhausted or cooling down");
      err.allKeysExhausted = true;
      err.status = rotator.status();
      throw err;
    }

    console.log(`[apify-client:${label}] Attempt ${attempt}/${maxAttempts} using ${entry.id}`);

    try {
      const result = await runFn(entry.token);
      rotator.markSuccess(entry);
      console.log(`[apify-client:${label}] ${entry.id} succeeded on attempt ${attempt}`);
      return result;
    } catch (err) {
      const classification = classifyError(err);
      errors.push({ key: entry.id, kind: classification.kind, message: err.message });
      console.warn(`[apify-client:${label}] ${entry.id} failed: ${classification.kind} — ${err.message}`);

      switch (classification.kind) {
        case "RATE_LIMIT":
          rotator.markExhausted(entry, COOLDOWNS.RATE_LIMIT, "rate_limit");
          continue;
        case "MONTHLY_CAP":
          rotator.markExhausted(entry, COOLDOWNS.MONTHLY_CAP, "monthly_cap");
          continue;
        case "TIMEOUT":
        case "NETWORK_ERROR":
          rotator.markExhausted(entry, COOLDOWNS.TIMEOUT, classification.kind.toLowerCase());
          continue;
        case "APIFY_SERVER_ERROR":
          rotator.markExhausted(entry, COOLDOWNS.SERVER_ERROR, "apify_server_error");
          continue;
        case "INVALID_TOKEN":
          rotator.markPermanentlyDead(entry, "invalid_or_revoked_token");
          continue;
        case "ACTOR_NOT_FOUND":
          console.error(`[apify-client:${label}] Actor not found — will fail on every key. Aborting without rotating.`);
          throw err;
        default:
          console.error(`[apify-client:${label}] Unclassified error, aborting without rotating: ${err.message}`);
          throw err;
      }
    }
  }

  console.error(`[apify-client:${label}] Exhausted ${maxAttempts} attempts across keys. Errors:`, errors);
  const finalErr = new Error(`All Apify attempts failed after ${maxAttempts} tries for ${label}`);
  finalErr.attempts = errors;
  throw finalErr;
}

/**
 * Run an actor synchronously and return its dataset items.
 * actorId uses Apify's slash form, e.g. "clockworks/tiktok-scraper".
 */
async function apifyRunSync(actorId, input, opts = {}) {
  const safeActorId = encodeURIComponent(actorId).replace("%2F", "~"); // Apify accepts "~" in place of "/" in the URL path form
  const label = opts.label || actorId;

  return callApify(async (token) => {
    const url = `https://api.apify.com/v2/acts/${safeActorId}/run-sync-get-dataset-items?token=${token}`;
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      opts.timeoutMs || REQUEST_TIMEOUT_MS
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(`Apify actor run failed: ${res.status} ${res.statusText}`);
      err.response = { status: res.status, data: body };
      throw err;
    }
    return res.json();
  }, { ...opts, label });
}

module.exports = { callApify, apifyRunSync, rotator };
