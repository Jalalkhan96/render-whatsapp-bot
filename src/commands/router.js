import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

import * as general from './general.js';
import * as admin from './admin.js';

import { sendMenu } from './menu.js';
import { setMenuMediaCommand } from './setmenumedia.js';

import {
  handleProfilePhoto,
  handleProfileInfo,
} from './media.js';

import {
  handleUptime,
  handleId,
  handleGroupInfo,
} from './tools.js';

import {
  handleTikTok,
  handleUniversalDownload,
  handleDocumentDownload,
} from './downloaders.js';

import {
  handleMeme,
  handleMemeSound,
  handleRandomSound,
  handleSoundSelection,
} from './meme.js';

import {
  handleStaff,
  handleLink,
  handleMemberAction,
  handleRename,
  handleDescription,
  handleMute,
  handleUnmute,
  handleLeave,
  handleTag,
  handleHidetag,
  handlePoll,
  handleDelete,
} from './group.js';

import {
  youtubeSearchCommand,
  handleYouTubeSelection,
  isYouTubeSelection,
  hasPendingYouTubeSearch,
} from './youtube.js';

import {
  pinterestCommand,
} from './pinterest.js';

import { config } from '../config.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('commands');
const require = createRequire(import.meta.url);
const { isBlockedAdultCommand, isBlockedAdultRequest } = require('../../lib/contentRestrictions.js');

function loadExternalCommands() {
  const extraDirs = [
    process.env.EXTRA_COMMAND_DIR,
    process.env.COMMAND_PLUGIN_DIR,
    path.resolve(process.cwd(), 'add to bot', 'ABIX-AE', 'ABIX', 'plugins'),
    path.resolve(process.cwd(), 'add to bot/ABIX-AE/ABIX/plugins'),
  ].filter(Boolean);

  const registry = new Map();
  const aliases = new Map();

  for (const dir of extraDirs) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter((file) => file.endsWith('.js'));
    for (const file of files) {
      try {
        const filePath = path.join(dir, file);
        const plugin = require(filePath);
        const commandName = plugin?.command;
        if (!commandName || typeof plugin?.handler !== 'function') continue;
        const pluginAliases = Array.isArray(plugin.aliases) ? plugin.aliases : [];
        if (isBlockedAdultCommand(commandName) || pluginAliases.some(isBlockedAdultCommand)) continue;

        registry.set(commandName.toLowerCase(), plugin);
        for (const alias of pluginAliases) {
          if (!isBlockedAdultCommand(alias)) aliases.set(alias.toLowerCase(), commandName.toLowerCase());
        }
      } catch (error) {
        log.warn({ file: dir, err: error.message }, 'Unable to load external command plugin');
      }
    }
  }

  return { registry, aliases };
}

const externalCommands = loadExternalCommands();

/* =====================================================
 * COMMAND PARSER
 * ===================================================== */

export function parseCommand(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const trimmed = text.trim();

  /*
   * ABIX accepts both:
  * /command
  * $command
  * .command
   */
  if (
    !trimmed.startsWith('/') &&
    !trimmed.startsWith('$') &&
    !trimmed.startsWith('.')
  ) {
    return null;
  }

  const body = trimmed.slice(1).trim();

  if (!body) {
    return null;
  }

  const match = body.match(
    /^(\S+)(?:\s+([\s\S]*))?$/
  );

  if (!match) {
    return null;
  }

  const command =
    match[1].toLowerCase();

  const rest =
    match[2] || '';

  const args =
    rest
      ? rest.split(/\s+/)
      : [];

  return {
    command,
    args,
    rest,
  };
}

/* =====================================================
 * AI
 * ===================================================== */

async function handleAi({ rest }) {
  if (!rest) {
    return (
      `🤖 Usage: ` +
      `${config.bot.prefix || '$'}ask <question>`
    );
  }

  const {
    generateResponse,
    friendlyErrorMessage,
  } = await import('../ai/gemini.js');

  try {
    return await generateResponse(
      [],
      rest
    );
  } catch (err) {
    return friendlyErrorMessage(
      err.message
    );
  }
}

/* =====================================================
 * ROUTER
 * ===================================================== */

export async function routeCommand({
  sock,
  jid,
  userId,
  isGroup,
  isAdminUser,
  parsed,
  msg,
}) {
  if (!parsed) {
    return null;
  }

  const {
    command,
    rest,
    args,
  } = parsed;

  const normalizedCommand = command.toLowerCase();
  if (isBlockedAdultRequest(normalizedCommand, rest)) {
    return '🚫 Adult commands and sources are disabled for everyone.';
  }
  const externalPlugin = externalCommands.registry.get(normalizedCommand) ||
    externalCommands.registry.get(externalCommands.aliases.get(normalizedCommand) || '');

  if (externalPlugin) {
    try {
      return await externalPlugin.handler(sock, msg, args, {
        chatId: jid,
        userId,
        isGroup,
        isAdminUser,
      });
    } catch (error) {
      log.error({ command: normalizedCommand, err: error.message }, 'External command failed');
      return `⚠️ The command \`${normalizedCommand}\` failed. Try again in a moment.`;
    }
  }

  const prefix =
    config.bot.prefix || '$';

  try {
    /* =================================================
     * YOUTUBE SELECTION
     * ================================================= */

    if (
      isYouTubeSelection(command) &&
      hasPendingYouTubeSearch(jid)
    ) {
      await handleYouTubeSelection({
        sock,
        chatJid: jid,
        text: command,
      });

      return null;
    }

    /* =================================================
     * MYINSTANTS SOUND SELECTION
     * ================================================= */

    if (
      /^[1-9]|10$/.test(command)
    ) {
      const handled =
        await handleSoundSelection({
          sock,
          jid,
          text: command,
        });

      if (handled) {
        return null;
      }
    }

    /* =================================================
     * COMMAND SWITCH
     * ================================================= */

    switch (command) {

      /* ===============================================
       * SYSTEM
       * =============================================== */

      case 'help':
        return general.handleHelp();

      case 'menu':
        return sendMenu({
          sock,
          jid,
          prefix,
          botName: config.bot.name,
          msg,
          section: rest,
        });

      case 'new':
      case 'reset':
      case 'clear':
        return general.handleNew(
          userId,
          isGroup
            ? 'group'
            : 'direct'
        );

      case 'status':
        return general.handleStatus();

      case 'model':
        return general.handleModel();

      case 'ping':
        return general.handlePing();

      case 'health':
        return isAdminUser
          ? admin.handleAiStatus()
          : general.handleStatus();

      case 'uptime':
      case 'runtime':
        return handleUptime();

      case 'id':
      case 'ids':
      case 'chatid':
      case 'jid':
        return handleId({
          jid,
          msg,
        });

      case 'version':
        return (
          `*${config.bot.name}*\n` +
          `Version: ${config.bot.version}\n` +
          `Prefix: ${prefix}`
        );

      /* ===============================================
       * PROFILE
       * =============================================== */

      case 'pp':
      case 'profilepic':
      case 'profilephoto':
      case 'avatar':
      case 'dp':
        await handleProfilePhoto({
          sock,
          jid,
          msg,
          arg: rest,
        });

        return null;

      case 'profile':
      case 'userinfo':
      case 'whois':
        return handleProfileInfo({
          sock,
          jid,
          msg,
          arg: rest,
        });

      /* ===============================================
       * YOUTUBE
       * =============================================== */

      case 'yt':
      case 'youtube':
        await youtubeSearchCommand({
          sock,
          chatJid: jid,
          args,
        });

        return null;

      /* ===============================================
       * PINTEREST
       * =============================================== */

      case 'pin':
      case 'pinterest':
        await pinterestCommand({
          sock,
          chatJid: jid,
          args,
        });

        return null;

      /* ===============================================
       * DOWNLOADERS
       * =============================================== */

      case 'tt':
      case 'tiktok':
        return handleTikTok({
          sock,
          jid,
          msg,
          arg: rest,
        });

      case 'dl':
      case 'download':
        return handleUniversalDownload({
          sock,
          jid,
          msg,
          arg: rest,
        });

      case 'doc':
        return handleDocumentDownload({
          sock,
          jid,
          msg,
          arg: rest,
        });

      /* ===============================================
       * MEMES
       * =============================================== */

      case 'meme':
      case 'memes':
      case 'randommeme':
      case 'memehindi':
      case 'reddit':
        return handleMeme({
          sock,
          jid,
          msg,
          arg:
            command === 'memehindi'
              ? 'hindi'
              : rest,
        });

      /* ===============================================
       * MYINSTANTS
       * =============================================== */

      case 'memesound':
      case 'sound':
        await handleMemeSound({
          sock,
          jid,
          query: rest,
        });

        return null;

      case 'randomsound':
        await handleRandomSound({
          sock,
          jid,
        });

        return null;

      /* ===============================================
       * AI
       * =============================================== */

      case 'ask':
      case 'ai':
      case 'gemini':
        return handleAi({
          rest,
        });

      /* ===============================================
       * GROUP
       * =============================================== */

      case 'groupinfo':
      case 'ginfo':
        return handleGroupInfo({
          sock,
          jid,
        });

      case 'staff':
        return handleStaff({
          sock,
          jid,
        });

      case 'link':
      case 'invite':
        return handleLink({
          sock,
          jid,
        });

      case 'add':
        return handleMemberAction({
          sock,
          jid,
          msg,
          arg: rest,
          action: 'add',
        });

      case 'kick':
        return handleMemberAction({
          sock,
          jid,
          msg,
          arg: rest,
          action: 'remove',
        });

      case 'promote':
        return handleMemberAction({
          sock,
          jid,
          msg,
          arg: rest,
          action: 'promote',
        });

      case 'demote':
        return handleMemberAction({
          sock,
          jid,
          msg,
          arg: rest,
          action: 'demote',
        });

      case 'setgname':
        return handleRename({
          sock,
          jid,
          arg: rest,
        });

      case 'setgdesc':
        return handleDescription({
          sock,
          jid,
          arg: rest,
        });

      case 'mute':
        return handleMute({
          sock,
          jid,
        });

      case 'unmute':
        return handleUnmute({
          sock,
          jid,
        });

      case 'tag':
        return handleTag({
          sock,
          jid,
          msg,
          arg: rest,
        });

      case 'tagall':
        return handleTag({
          sock,
          jid,
          msg,
          all: true,
        });

      case 'tagnotadmin':
        return handleTag({
          sock,
          jid,
          msg,
          all: true,
          nonAdmins: true,
        });

      case 'hidetag':
        return handleHidetag({
          sock,
          jid,
          msg,
          arg: rest,
        });

      case 'poll':
        return handlePoll({
          sock,
          jid,
          msg,
          arg: rest,
        });

      case 'delete':
        return handleDelete({
          sock,
          jid,
          msg,
        });

      /* ===============================================
       * CALCULATOR
       * =============================================== */

      case 'calc': {
        if (!rest) {
          return (
            `Usage: ${prefix}` +
            `calc 2+2*5`
          );
        }

        if (
          !/^[0-9+\-*/().%\s]+$/.test(
            rest
          )
        ) {
          return (
            '❌ Only numeric expressions are allowed.'
          );
        }

        try {
          // eslint-disable-next-line no-new-func
          const result =
            Function(
              `"use strict"; return (${rest})`
            )();

          return (
            `🧮 ${rest} = *${result}*`
          );
        } catch {
          return (
            '❌ Invalid mathematical expression.'
          );
        }
      }

      /* ===============================================
       * DATE / TIME
       * =============================================== */

      case 'time':
        return (
          `🕒 ${new Date().toLocaleString()}`
        );

      case 'date':
        return (
          `📅 ${new Date().toLocaleDateString()}`
        );

      /* ===============================================
       * ENCODING
       * =============================================== */

      case 'b64enc':
        if (!rest) {
          return (
            `Usage: ${prefix}` +
            `b64enc <text>`
          );
        }

        return Buffer
          .from(
            rest,
            'utf8'
          )
          .toString('base64');

      case 'b64dec':
        if (!rest) {
          return (
            `Usage: ${prefix}` +
            `b64dec <base64>`
          );
        }

        try {
          return Buffer
            .from(
              rest,
              'base64'
            )
            .toString('utf8');
        } catch {
          return (
            '❌ Invalid Base64.'
          );
        }

      /* ===============================================
       * HASHING
       * =============================================== */

      case 'md5':
        return crypto
          .createHash('md5')
          .update(rest)
          .digest('hex');

      case 'sha256':
        return crypto
          .createHash('sha256')
          .update(rest)
          .digest('hex');

      /* ===============================================
       * PASSWORD
       * =============================================== */

      case 'password': {
        const length =
          Math.min(
            64,
            Math.max(
              8,
              Number.parseInt(
                rest || '16',
                10
              ) || 16
            )
          );

        const chars =
          'ABCDEFGHJKLMNPQRSTUVWXYZ' +
          'abcdefghijkmnopqrstuvwxyz' +
          '23456789!@#$%^&*';

        let output = '';

        for (
          let i = 0;
          i < length;
          i += 1
        ) {
          output +=
            chars[
              crypto.randomInt(
                chars.length
              )
            ];
        }

        return (
          `🔐 *Password*\n` +
          `\`${output}\``
        );
      }

      /* ===============================================
       * URL CHECK
       * =============================================== */

      case 'checkurl': {
        if (
          !rest ||
          !/^https?:\/\//i.test(
            rest
          )
        ) {
          return (
            `Usage: ${prefix}` +
            `checkurl <https://example.com>`
          );
        }

        try {
          const started =
            Date.now();

          const response =
            await fetch(
              rest,
              {
                method: 'HEAD',
                redirect: 'follow',
                signal:
                  AbortSignal.timeout(
                    15000
                  ),
              }
            );

          return (
            `🌐 *URL CHECK*\n` +
            `Status: *${response.status} ${response.statusText}*\n` +
            `Latency: *${Date.now() - started} ms*\n` +
            `Final URL: ${response.url}`
          );
        } catch (error) {
          return (
            `❌ URL check failed: ` +
            `${error.message}`
          );
        }
      }

      /* ===============================================
       * FUN
       * =============================================== */

      case 'coinflip':
        return (
          `🪙 *${
            Math.random() < 0.5
              ? 'Heads'
              : 'Tails'
          }*`
        );

      case 'dice':
        return (
          `🎲 *${
            Math.floor(
              Math.random() * 6
            ) + 1
          }*`
        );

      case '8ball': {
        const answers = [
          'Yes.',
          'No.',
          'Maybe.',
          'Definitely.',
          'Ask again later.',
        ];

        return (
          `🎱 ${
            answers[
              Math.floor(
                Math.random() *
                answers.length
              )
            ]
          }`
        );
      }

      case 'uuid':
        return crypto.randomUUID();

      /* ===============================================
       * ADMIN
       * =============================================== */

      case 'admin':
        if (!isAdminUser) return null;

        return admin.handleAdminHelp();

      case 'groups':
        if (!isAdminUser) return null;

        return admin.handleGroups();

      case 'addgroup':
        if (!isAdminUser) return null;

        return admin.handleAddGroup(
          jid,
          null
        );

      case 'removegroup':
        if (!isAdminUser) return null;

        return admin.handleRemoveGroup(
          jid
        );

      case 'broadcast':
        if (!isAdminUser) return null;

        return admin.handleBroadcast(
          sock,
          rest
        );

      case 'settings':
        if (!isAdminUser) return null;

        return admin.handleSettings();

      case 'setmodel':
        if (!isAdminUser) return null;

        return admin.handleSetModel(
          rest
        );

      case 'setprompt':
        if (!isAdminUser) return null;

        return admin.handleSetPrompt(
          rest
        );

      case 'block':
        if (!isAdminUser) return null;

        return admin.handleBlock(
          rest
        );

      case 'unblock':
        if (!isAdminUser) return null;

        return admin.handleUnblock(
          rest
        );

      case 'setmenumedia':
        if (!isAdminUser) return null;

        await setMenuMediaCommand({
          sock,
          jid,
          args,
          msg,
        });

        return null;

      case 'leave':
        if (!isAdminUser) return null;

        return handleLeave({
          sock,
          jid,
        });

      /* ===============================================
       * UNKNOWN
       * =============================================== */

      default:
        return (
          `❓ Unknown command: ` +
          `${prefix}${command}\n` +
          `Use ${prefix}menu or ` +
          `${prefix}help.`
        );
    }
  } catch (err) {
    log.error(
      {
        command,
        err: err.message,
        stack: err.stack,
      },
      'Command handler failed'
    );

    return (
      `⚠️ Command failed: ` +
      `${err.message}`
    );
  }
}