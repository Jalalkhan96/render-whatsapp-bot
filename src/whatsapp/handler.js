import { config } from '../config.js';
import { childLogger } from '../utils/logger.js';
import {
  extractText,
  isGroupJid,
} from './messages.js';
import { sendText } from './client.js';
import { enqueueForUser } from '../queue/messageQueue.js';
import {
  isValidText,
  isWithinLength,
  sanitizeForLog,
} from '../utils/validation.js';
import {
  findOrCreateUser,
  getLastRequestAt,
} from '../database/repositories/userRepository.js';
import {
  parseCommand,
  routeCommand,
} from '../commands/router.js';
import { isAdmin } from '../commands/admin.js';

import {
  getInteractiveReplyId,
  resolveInteractiveCommand,
} from '../whatsapp-ui/interactiveReply.js';

import {
  hasPendingYouTubeSearch,
  isYouTubeSelection,
} from '../commands/youtube.js';

import {
  hasPendingSoundSearch,
  isSoundSelection,
  handleSoundSelection,
} from '../commands/meme.js';

const log = childLogger('handler');

/* =====================================================
 * IGNORE CHAT / MESSAGE
 * ===================================================== */

function shouldIgnoreChat(msg) {
  const jid = msg?.key?.remoteJid;

  if (!jid) return true;

  if (jid === 'status@broadcast') {
    return true;
  }

  if (jid.endsWith('@newsletter')) {
    return true;
  }

  if (msg?.key?.fromMe) {
    return true;
  }

  return false;
}

/* =====================================================
 * GET MESSAGE TEXT
 * ===================================================== */

function getCommandText(msg) {
  /*
   * First check interactive/native-flow replies.
   */
  const tappedId =
    getInteractiveReplyId(msg);

  if (tappedId) {
    const resolved =
      resolveInteractiveCommand(
        tappedId,
        config.bot.prefix || '$'
      );

    if (resolved) {
      return resolved;
    }
  }

  return extractText(msg);
}

/* =====================================================
 * YOUTUBE SELECTION
 * ===================================================== */

function getYouTubeSelectionText(
  text,
  jid
) {
  if (
    !text ||
    typeof text !== 'string'
  ) {
    return null;
  }

  const trimmed =
    text.trim();

  if (
    !isYouTubeSelection(
      trimmed
    )
  ) {
    return null;
  }

  if (
    !hasPendingYouTubeSearch(
      jid
    )
  ) {
    return null;
  }

  return trimmed;
}

/* =====================================================
 * SOUND SELECTION
 * ===================================================== */

function getSoundSelectionText(
  text,
  jid
) {
  if (
    !text ||
    typeof text !== 'string'
  ) {
    return null;
  }

  const trimmed =
    text.trim();

  if (
    !isSoundSelection(
      trimmed
    )
  ) {
    return null;
  }

  if (
    !hasPendingSoundSearch(
      jid
    )
  ) {
    return null;
  }

  return trimmed;
}

/* =====================================================
 * PROCESS ONE MESSAGE
 * ===================================================== */

export async function processSingleMessage(
  sock,
  msg
) {
  try {
    if (
      shouldIgnoreChat(msg)
    ) {
      return;
    }

    const jid =
      msg?.key?.remoteJid;

    if (!jid) {
      return;
    }

    const isGroup =
      isGroupJid(jid);

    const text =
      getCommandText(msg);

    if (
      !isValidText(text)
    ) {
      return;
    }

    /* =================================================
     * SPECIAL SELECTIONS
     * =================================================
     *
     * Normal text is still ignored.
     *
     * Numeric messages are accepted only when there is
     * an active pending YouTube/sound selection.
     */

    const youtubeSelection =
      getYouTubeSelectionText(
        text,
        jid
      );

    const soundSelection =
      getSoundSelectionText(
        text,
        jid
      );

    let parsed = null;

    /* =================================================
     * YOUTUBE 1-5
     * ================================================= */

    if (youtubeSelection) {
      parsed = {
        command:
          youtubeSelection,
        args: [],
        rest: '',
      };
    }

    /* =================================================
     * MYINSTANTS 1-10
     * ================================================= */

    else if (soundSelection) {
      parsed = {
        command:
          soundSelection,
        args: [],
        rest: '',
      };
    }

    /* =================================================
     * NORMAL COMMAND
     * ================================================= */

    else {
      parsed =
        parseCommand(text);

      /*
       * HARD RULE:
       *
       * If it isn't a command, ignore it.
       */
      if (!parsed) {
        log.debug(
          {
            jid,
            text:
              sanitizeForLog(
                text,
                100
              ),
          },
          'Ignoring non-command message'
        );

        return;
      }
    }

    /* =================================================
     * LENGTH CHECK
     * ================================================= */

    if (
      !isWithinLength(text)
    ) {
      await sendText(
        sock,
        jid,
        `⚠️ Command too long. Maximum ${config.limits.maxMessageLength} characters.`
      );

      return;
    }

    /* =================================================
     * SENDER
     * ================================================= */

    const senderJid =
      isGroup
        ? (
            msg?.key?.participant ||
            jid
          )
        : jid;

    if (!senderJid) {
      return;
    }

    /* =================================================
     * USER
     * ================================================= */

    const user =
      await findOrCreateUser(
        senderJid,
        msg?.pushName || null
      );

    if (
      user?.is_blocked
    ) {
      log.debug(
        {
          senderJid,
        },
        'Blocked user message ignored'
      );

      return;
    }

    /* =================================================
     * ADMIN
     * ================================================= */

    const isAdminUser =
      isAdmin(senderJid);

    /* =================================================
     * COOLDOWN
     * ================================================= */

    if (!isAdminUser) {
      const lastRequestAt =
        await getLastRequestAt(
          user.id
        );

      if (lastRequestAt) {
        const elapsed =
          Date.now() -
          new Date(
            lastRequestAt
          ).getTime();

        if (
          elapsed <
          config.limits
            .requestCooldownMs
        ) {
          return;
        }
      }
    }

    /* =================================================
     * LOG
     * ================================================= */

    log.info(
      {
        command:
          parsed.command,
        senderJid,
        jid,
        isGroup,
        isAdminUser,
        youtubeSelection:
          Boolean(
            youtubeSelection
          ),
        soundSelection:
          Boolean(
            soundSelection
          ),
      },
      'Processing command'
    );

    /* =================================================
     * SPECIAL SOUND SELECTION
     * =================================================
     *
     * Handle it directly so the numeric message doesn't
     * get confused with another command.
     */

    if (soundSelection) {
      await handleSoundSelection(
        {
          sock,
          jid,
          text: soundSelection,
        }
      );

      return;
    }

    /* =================================================
     * ROUTER
     * ================================================= */

    const reply =
      await routeCommand(
        {
          sock,

          /*
           * Groups use group JID.
           * Private chats use sender JID.
           */
          jid: isGroup
            ? jid
            : senderJid,

          userId:
            user.id,

          isGroup,

          isAdminUser,

          parsed,

          msg,
        }
      );

    /* =================================================
     * REPLY
     * =================================================
     *
     * IMPORTANT:
     *
     * Commands that already sent their own message return
     * null. We only send text when there is actual text.
     *
     * This prevents:
     *
     *   true
     *
     * from being sent to WhatsApp.
     */

    if (
      reply !== null &&
      reply !== undefined &&
      typeof reply !== 'boolean' &&
      String(reply).trim()
    ) {
      await sendText(
        sock,
        jid,
        String(reply)
      );
    }
  } catch (err) {
    log.error(
      {
        err:
          err.message,
        stack:
          err.stack,
      },
      'Message processing failed'
    );
  }
}

/* =====================================================
 * CREATE MESSAGE HANDLER
 * ===================================================== */

export function createMessageHandler(
  sock
) {
  return async ({
    messages,
    type,
  }) => {
    /*
     * Only process notify events.
     */
    if (
      type !== 'notify' ||
      !Array.isArray(messages)
    ) {
      return;
    }

    for (
      const msg
      of messages
    ) {
      try {
        if (
          shouldIgnoreChat(
            msg
          )
        ) {
          continue;
        }

        const jid =
          msg?.key?.remoteJid;

        if (!jid) {
          continue;
        }

        const isGroup =
          isGroupJid(jid);

        const senderJid =
          isGroup
            ? (
                msg?.key
                  ?.participant ||
                jid
              )
            : jid;

        if (!senderJid) {
          continue;
        }

        /*
         * Keep processing serialized through the existing
         * per-user queue.
         */
        enqueueForUser(
          senderJid,
          () =>
            processSingleMessage(
              sock,
              msg
            )
        );
      } catch (err) {
        log.error(
          {
            err:
              err.message,
          },
          'Failed to enqueue WhatsApp message'
        );
      }
    }
  };
}