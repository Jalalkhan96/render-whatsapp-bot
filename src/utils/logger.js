import pino from 'pino';
import { config } from '../config.js';

// Redact common secret-bearing fields at the transport level as a safety net.
export const logger = pino({
  level: config.logging.level,
  redact: {
    paths: [
      'apiKey',
      'GEMINI_API_KEY',
      'authorization',
      '*.apiKey',
      '*.password',
      '*.token',
      'creds',
      '*.creds',
    ],
    censor: '[REDACTED]',
  },
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
});

export function childLogger(scope) {
  return logger.child({ scope });
}
