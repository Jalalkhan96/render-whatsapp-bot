/**
 * ABIX Gemini service.
 *
 * Web2API is the default backend and is started/health-checked through
 * lib/geminiGateway.js. The official Gemini API remains available when
 * GEMINI_BACKEND=official is explicitly selected.
 */
const axios = require('axios');
const geminiGateway = require('./geminiGateway');

const DEFAULT_MODEL = 'gemini-3.6-flash';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_WEB2API_URL = 'http://127.0.0.1:8081/v1/chat/completions';

function apiKey() {
  return String(process.env.GEMINI_API_KEY || '').trim();
}

function modelName() {
  return String(process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function timeoutMs() {
  const value = Number(process.env.GEMINI_TIMEOUT_MS || DEFAULT_TIMEOUT);
  return Number.isFinite(value) && value >= 5000 ? value : DEFAULT_TIMEOUT;
}

function endpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

function useWeb2Api() {
  return String(process.env.GEMINI_BACKEND || 'web2api').toLowerCase() !== 'official' &&
    String(process.env.GEMINI_USE_WEB2API || 'true').toLowerCase() !== 'false';
}

function web2ApiUrl() {
  return String(process.env.GEMINI_URL || DEFAULT_WEB2API_URL).trim();
}

function web2ApiModel(options = {}) {
  const requested = String(options.model || process.env.GEMINI_MODEL || 'gemini-3.6-flash').trim();
  return requested.toLowerCase() === 'gemini-3.8-flash' ? 'gemini-3.6-flash' : requested;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(item => item && typeof item.content === 'string' && item.content.trim())
    .map(item => ({
      role: item.role === 'assistant' || item.role === 'model' ? 'model' : 'user',
      parts: [{ text: item.content.trim() }],
    }));
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';

  return parts
    .filter(part => typeof part?.text === 'string')
    .map(part => part.text)
    .join('')
    .trim();
}

function mapError(error) {
  const status = Number(error?.response?.status || error?.status || error?.statusCode || 0);
  const message = String(
    error?.response?.data?.error?.message || error?.message || ''
  );

  if (status === 400) {
    const err = new Error(message || 'Invalid Gemini API request.');
    err.code = 'BAD_REQUEST';
    return err;
  }
  if (status === 401 || status === 403) {
    const err = new Error('Gemini API authentication failed.');
    err.code = 'AUTH_ERROR';
    return err;
  }
  if (status === 429) {
    const err = new Error('Gemini API quota or rate limit exceeded.');
    err.code = 'RATE_LIMIT';
    return err;
  }
  if (status >= 500) {
    const err = new Error('Gemini API server error.');
    err.code = 'SERVER_ERROR';
    return err;
  }
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' || /timeout/i.test(message)) {
    const err = new Error('Gemini API request timed out.');
    err.code = 'TIMEOUT';
    return err;
  }

  const err = new Error(message || 'Gemini API request failed.');
  err.code = 'UNKNOWN_ERROR';
  return err;
}

async function generateResponse(history, newMessage, options = {}) {
  const prompt = String(newMessage || '').trim();
  if (!prompt) {
    const error = new Error('Gemini prompt is empty.');
    error.code = 'BAD_REQUEST';
    throw error;
  }

  if (useWeb2Api()) {
    try {
      const messages = normalizeHistory(history).map(item => ({
        role: item.role === 'model' ? 'assistant' : item.role,
        content: item.parts.map(part => part.text).join(''),
      }));
      messages.push({ role: 'user', content: prompt });
      const response = await axios.post(web2ApiUrl(), {
        model: web2ApiModel(options),
        messages,
        temperature: Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.7,
        max_completion_tokens: Number(options.maxOutputTokens) > 0 ? Number(options.maxOutputTokens) : 2048,
        stream: false,
      }, { timeout: timeoutMs(), headers: { 'Content-Type': 'application/json' } });
      const text = String(response.data?.choices?.[0]?.message?.content || '').trim();
      if (!text) throw Object.assign(new Error('Gemini Web2API returned an empty response.'), { code: 'EMPTY_RESPONSE' });
      return text;
    } catch (error) {
      if (error?.code && ['EMPTY_RESPONSE', 'BAD_REQUEST'].includes(error.code)) throw error;
      throw mapError(error);
    }
  }

  const key = apiKey();
  if (!key) {
    const error = new Error('GEMINI_API_KEY is not configured.');
    error.code = 'AUTH_ERROR';
    throw error;
  }

  const model = String(options.model || modelName()).trim() || DEFAULT_MODEL;
  const contents = [
    ...normalizeHistory(history),
    { role: 'user', parts: [{ text: prompt }] },
  ];

  const payload = {
    contents,
    generationConfig: {
      maxOutputTokens: Number(options.maxOutputTokens) > 0
        ? Number(options.maxOutputTokens)
        : 2048,
      temperature: Number.isFinite(Number(options.temperature))
        ? Number(options.temperature)
        : 0.7,
    },
  };

  if (options.systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: String(options.systemInstruction) }],
    };
  }

  try {
    const response = await axios.post(
      endpoint(model),
      payload,
      {
        params: { key },
        timeout: timeoutMs(),
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true,
      }
    );

    if (response.status < 200 || response.status >= 300) {
      const error = mapError({ response });
      throw error;
    }

    const text = extractText(response.data);
    if (!text) {
      const error = new Error('Gemini returned an empty response.');
      error.code = 'EMPTY_RESPONSE';
      throw error;
    }

    return text;
  } catch (error) {
    if (error?.code && [
      'BAD_REQUEST',
      'AUTH_ERROR',
      'RATE_LIMIT',
      'SERVER_ERROR',
      'TIMEOUT',
      'EMPTY_RESPONSE',
      'UNKNOWN_ERROR',
    ].includes(error.code)) {
      throw error;
    }
    throw mapError(error);
  }
}

async function generateGemini(prompt, options = {}) {
  return generateResponse([], prompt, options);
}

async function verifyAuthentication(timeout = timeoutMs()) {
  if (!apiKey()) return false;

  try {
    await generateGemini('Reply with exactly: OK', {
      maxOutputTokens: 8,
      temperature: 0,
    });
    return true;
  } catch {
    return false;
  }
}

async function waitForHealthy() {
  return useWeb2Api() ? geminiGateway.isHealthy() : Boolean(apiKey());
}

function status() {
  const web2api = useWeb2Api();
  const gatewayStatus = web2api ? geminiGateway.getGeminiGatewayStatus() : null;
  return {
    running: web2api ? Boolean(gatewayStatus?.running) : Boolean(apiKey()),
    backend: web2api ? 'gemini-web2api' : 'official-gemini-api',
    host: web2api ? gatewayStatus.host : 'generativelanguage.googleapis.com',
    port: web2api ? gatewayStatus.port : 443,
    model: web2api ? web2ApiModel() : modelName(),
    apiConfigured: web2api ? Boolean(gatewayStatus?.script) : Boolean(apiKey()),
    authentication: web2api ? 'gemini-web2api' : 'api-key',
    gateway: gatewayStatus,
  };
}

// Kept for compatibility with the existing startup/admin architecture.
// There is no child process to start or restart anymore.
async function startGemini() {
  if (useWeb2Api()) {
    try {
      const result = await geminiGateway.startGeminiGateway();
      console.log(`[Gemini] Web2API ready at ${result.url}`);
      return true;
    } catch (error) {
      console.error('[Gemini] Web2API startup failed:', error.message);
      return false;
    }
  }
  const configured = Boolean(apiKey());
  console.log(configured
    ? `[Gemini] Official Gemini API ready (${modelName()})`
    : '[Gemini] GEMINI_API_KEY is missing; Gemini commands disabled');
  return configured;
}

async function stopGemini() {
  return useWeb2Api() ? geminiGateway.stopGeminiGateway() : true;
}

async function restartGemini() {
  await stopGemini();
  return startGemini();
}

// Deprecated Web2API compatibility helpers. They intentionally do not read
// or manage Gemini cookies because the bot now uses the official API only.
function cookieFile() {
  return null;
}

function cookieStatus() {
  return { configured: useWeb2Api(), loaded: false, deprecated: false };
}

function friendlyErrorMessage(errorCode) {
  switch (errorCode) {
    case 'AUTH_ERROR':
      return useWeb2Api()
        ? '⚠️ Gemini Web2API is not available. Check Python and the bundled gateway.'
        : '⚠️ Gemini API is not configured correctly. Check GEMINI_API_KEY.';
    case 'RATE_LIMIT':
      return '⚠️ Gemini API quota/rate limit reached. Please try again later.';
    case 'TIMEOUT':
      return '⚠️ Gemini took too long to respond. Please try again.';
    case 'BAD_REQUEST':
      return '⚠️ Gemini rejected the request. Please try a shorter question.';
    case 'EMPTY_RESPONSE':
      return "⚠️ Gemini returned no answer. Please try again.";
    case 'SERVER_ERROR':
      return '⚠️ Gemini is temporarily unavailable. Please try again shortly.';
    default:
      return "⚠️ I couldn't get a Gemini response right now.";
  }
}

module.exports = {
  generateResponse,
  generateGemini,
  friendlyErrorMessage,
  startGemini,
  stopGemini,
  restartGemini,
  waitForHealthy,
  verifyAuthentication,
  status,
  cookieFile,
  cookieStatus,
};
