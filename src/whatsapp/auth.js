import fs from 'fs';
import path from 'path';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { config } from '../config.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('auth');

export function ensureAuthDir() {
  const dir = path.resolve(config.auth.dir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log.info({ dir }, 'Created auth directory');
  }
  return dir;
}

/**
 * Loads (or initializes) persistent multi-file auth state.
 * Baileys' saveCreds callback is returned and must be wired to the
 * `creds.update` event so session state survives restarts.
 */
export async function loadAuthState() {
  const dir = ensureAuthDir();
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  return { state, saveCreds };
}

/**
 * Deletes the auth directory contents to force a fresh pairing.
 * Only ever call this deliberately (e.g. admin-triggered reset), never
 * automatically on generic errors.
 */
export function resetAuthState() {
  const dir = path.resolve(config.auth.dir);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    log.warn({ dir }, 'Auth state directory removed - fresh pairing will be required');
  }
  ensureAuthDir();
}
