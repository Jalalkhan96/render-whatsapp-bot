import { config } from '../config.js';
import {
  getOrCreateActiveConversation,
  createConversation,
} from '../database/repositories/conversationRepository.js';
import {
  saveMessage,
  getRecentMessages,
  messageExists,
} from '../database/repositories/messageRepository.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('memory');

export async function getConversationContext(userId, type = 'direct') {
  const conversation = await getOrCreateActiveConversation(userId, type);
  const history = await getRecentMessages(conversation.id, config.memory.maxHistory);
  return { conversation, history };
}

export async function startNewConversation(userId, type = 'direct') {
  const conversation = await createConversation(userId, type);
  log.info({ userId, conversationId: conversation.id }, 'New conversation started');
  return conversation;
}

export async function recordUserMessage(conversationId, whatsappMessageId, content, metadata = {}) {
  if (whatsappMessageId && (await messageExists(whatsappMessageId))) {
    log.warn({ whatsappMessageId }, 'Duplicate inbound message ignored');
    return null;
  }
  return saveMessage({
    conversationId,
    whatsappMessageId,
    role: 'user',
    content,
    metadata,
  });
}

export async function recordAssistantMessage(conversationId, content, metadata = {}) {
  return saveMessage({
    conversationId,
    whatsappMessageId: null,
    role: 'assistant',
    content,
    metadata,
  });
}

/**
 * Converts stored history rows into AI-compatible chat messages.
 */
export function toChatMessages(history) {
  return history.map((row) => ({
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
  }));
}
