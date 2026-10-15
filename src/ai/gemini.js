import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { childLogger } from '../utils/logger.js';
import { getSystemPrompt } from './prompt.js';
import { getSetting } from '../database/repositories/settingsRepository.js';

const log = childLogger('gemini');

const client = new GoogleGenAI({ apiKey: config.gemini.apiKey });

export async function generateResponse(history, newMessage, options = {}) {
  const storedModel = await getSetting('override_model', null);
  const model = options.model || storedModel || config.gemini.model;
  const systemPrompt = await getSystemPrompt();
  const contents = [
    ...history.map((item) => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content }],
    })),
    { role: 'user', parts: [{ text: newMessage }] },
  ];

  const start = Date.now();
  try {
    const response = await client.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 2000,
      },
    });

    const duration = Date.now() - start;
    const content = response?.text?.trim();

    if (!content) {
      log.error({ duration, model }, 'Gemini returned an empty response');
      throw new Error('EMPTY_RESPONSE');
    }

    log.info(
      { duration, model, usage: response?.usageMetadata },
      'Gemini response received'
    );
    return content;
  } catch (err) {
    const duration = Date.now() - start;
    const status = err?.status || err?.statusCode;

    if (status === 401 || status === 403) {
      log.error({ duration, status }, 'Gemini authentication failed - check GEMINI_API_KEY');
      throw new Error('AUTH_ERROR');
    }
    if (status === 429) {
      log.error({ duration }, 'Gemini rate limit or quota exceeded');
      throw new Error('RATE_LIMIT');
    }
    if (err?.code === 'ETIMEDOUT' || err?.name === 'AbortError' || /timeout/i.test(err?.message || '')) {
      log.error({ duration }, 'Gemini request timed out');
      throw new Error('TIMEOUT');
    }
    if (status >= 500) {
      log.error({ duration, status }, 'Gemini server error');
      throw new Error('SERVER_ERROR');
    }

    log.error({ duration, err: err?.message, status }, 'Gemini request failed');
    throw new Error('UNKNOWN_ERROR');
  }
}

export function friendlyErrorMessage(errorCode) {
  switch (errorCode) {
    case 'AUTH_ERROR':
      return '⚠️ The AI service is misconfigured. Please contact the administrator.';
    case 'RATE_LIMIT':
      return '⚠️ The AI service is busy right now. Please try again in a moment.';
    case 'TIMEOUT':
      return '⚠️ That request took too long to process. Please try again, or try a shorter question.';
    case 'EMPTY_RESPONSE':
      return "⚠️ I couldn't generate a response for that. Could you rephrase it?";
    case 'SERVER_ERROR':
      return '⚠️ The AI service is temporarily unavailable. Please try again shortly.';
    default:
      return "⚠️ I couldn't process that request right now. Please try again.";
  }
}
