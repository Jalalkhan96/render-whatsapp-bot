export const COMMAND_CATALOG = [
  // SYSTEM
  ['help', 'Show help', 'system'],
  ['menu', 'Open interactive menu', 'system'],
  ['ping', 'Check responsiveness', 'system'],
  ['status', 'Show bot status', 'system'],
  ['health', 'Show health status', 'system'],
  ['uptime', 'Show process uptime', 'system'],
  ['id', 'Show chat/sender IDs', 'system'],
  ['model', 'Show Gemini model', 'system'],
  ['version', 'Show bot version', 'system'],

  // OWNER
  ['admin', 'Owner/admin commands', 'owner'],
  ['groups', 'List approved groups', 'owner'],
  ['addgroup', 'Approve current group', 'owner'],
  ['removegroup', 'Remove group approval', 'owner'],
  ['broadcast', 'Broadcast to approved groups', 'owner'],
  ['settings', 'Show bot settings', 'owner'],
  ['setmodel', 'Change Gemini model', 'owner'],
  ['setprompt', 'Change system prompt', 'owner'],
  ['block', 'Block a user', 'owner'],
  ['unblock', 'Unblock a user', 'owner'],
  ['setmenumedia', 'Set menu image/video/gif', 'owner'],
  ['leave', 'Leave the current group', 'owner'],

  // GROUP
  ['groupinfo', 'Group information', 'group'],
  ['staff', 'List group admins', 'group'],
  ['link', 'Get group invite link', 'group'],
  ['invite', 'Get group invite link', 'group'],
  ['add', 'Add a member', 'group'],
  ['kick', 'Remove a member', 'group'],
  ['promote', 'Promote a member', 'group'],
  ['demote', 'Demote a member', 'group'],
  ['tag', 'Mention a member', 'group'],
  ['tagall', 'Mention all members', 'group'],
  ['hidetag', 'Mention all without visible tags', 'group'],
  ['setgname', 'Change group name', 'group'],
  ['setgdesc', 'Change group description', 'group'],
  ['mute', 'Mute group', 'group'],
  ['unmute', 'Unmute group', 'group'],
  ['delete', 'Delete a replied message', 'group'],
  ['poll', 'Create a group poll', 'group'],
  ['tagnotadmin', 'Mention non-admins', 'group'],

  // UTILITY
  ['calc', 'Calculate an expression', 'utility'],
  ['time', 'Show current time', 'utility'],
  ['date', 'Show current date', 'utility'],
  ['jid', 'Show current chat JID', 'utility'],
  ['b64enc', 'Base64 encode', 'utility'],
  ['b64dec', 'Base64 decode', 'utility'],
  ['md5', 'MD5 hash', 'utility'],
  ['sha256', 'SHA-256 hash', 'utility'],
  ['password', 'Generate secure password', 'utility'],
  ['checkurl', 'Check URL status', 'utility'],

  // MEDIA
  ['dl', 'Universal media downloader', 'media'],
  ['yt', 'Download YouTube video', 'media'],
  ['youtube', 'Download YouTube video', 'media'],
  ['tt', 'Download TikTok video/slides', 'media'],
  ['tiktok', 'Download TikTok video/slides', 'media'],
  ['doc', 'Download URL as document', 'media'],
  ['pp', 'Download profile picture', 'media'],
  ['avatar', 'Download profile picture', 'media'],
  ['dp', 'Download profile picture', 'media'],

  // AI
  ['ask', 'Ask Gemini explicitly', 'ai'],
  ['ai', 'Ask Gemini explicitly', 'ai'],
  ['gemini', 'Ask Gemini explicitly', 'ai'],

  // ECONOMY

  // GAME
  ['game', 'Open the dedicated game center', 'game'],
  ['games', 'Open the dedicated game center', 'game'],
  ['tictactoe', 'Challenge a player to TicTacToe', 'game'],
  ['ttt', 'Challenge a player to TicTacToe', 'game'],
  ['connect4', 'Connect Four (coming soon)', 'game'],
  ['chess', 'Chess (coming soon)', 'game'],
  ['checkers', 'Checkers (coming soon)', 'game'],
  ['rps', 'Rock Paper Scissors (coming soon)', 'game'],
  ['quiz', 'Quiz (coming soon)', 'game'],
  ['coinflip', 'Flip a coin', 'game'],
  ['dice', 'Roll dice', 'game'],
  ['8ball', 'Magic 8-ball', 'game'],

  // FUN
  ['meme', 'Get a meme', 'fun'],
  ['memes', 'Get a meme/topic', 'fun'],
  ['randommeme', 'Get a random meme', 'fun'],
  ['memehindi', 'Get a Hindi meme', 'fun'],
  ['memesound', 'Get meme sound', 'fun'],
  ['randomsound', 'Get random meme sound', 'fun'],

  // TOOLS
  ['uuid', 'Generate UUID', 'tools'],
  ['b64enc', 'Base64 encode', 'tools'],
  ['b64dec', 'Base64 decode', 'tools'],
  ['md5', 'MD5 hash', 'tools'],
  ['sha256', 'SHA-256 hash', 'tools'],
  ['password', 'Generate secure password', 'tools'],
  ['checkurl', 'Check URL', 'tools'],

  // SEARCH
  ['reddit', 'Meme/search via Reddit', 'search'],
  ['pinterest', 'Meme/search via Pinterest', 'search'],

  // OTHER
  ['new', 'Start new conversation', 'other'],
  ['reset', 'Reset conversation', 'other'],
  ['clear', 'Clear conversation', 'other'],
];

export const CATEGORIES = [
  ['system', '⚙️', 'SYSTEM'],
  ['owner', '👑', 'OWNER'],
  ['group', '👥', 'GROUP'],
  ['utility', '🧰', 'UTILITY'],
  ['media', '🎬', 'MEDIA'],
  ['ai', '🤖', 'AI'],
  ['economy', '🏦', 'ECONOMY'],
  ['game', '🎮', 'GAME'],
  ['fun', '🎉', 'FUN'],
  ['tools', '🔧', 'TOOLS'],
  ['search', '🔎', 'SEARCH'],
  ['other', '📁', 'OTHER'],
];

export function getCommandsByCategory(category) {
  return COMMAND_CATALOG.filter(([, , cat]) => cat === category);
}

export function getTotalCommandCount() {
  return COMMAND_CATALOG.length;
}
