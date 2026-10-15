'use strict';

/**
 * ABIX-AE Sliderchecking v3
 *
 * The real plugin lives outside plugins2. A tiny bridge in plugins2 makes
 * the existing ABIX command loader discover this command without changing
 * commandHandler.js or the existing menu/plugin files.
 */

const { sendInteractiveCarousel } = require('../lib/interactiveMenu');

const GAMES = [
  ['🦖 Dino Runner', 'Jump over obstacles', '/dino'],
  ['🐍 Snake', 'Eat, grow, survive', '/snake'],
  ['🎹 Piano', 'Play & record music', '/piano'],
  ['🚗 Car Race', 'Dodge traffic', '/race'],
  ['🐦 Flappy Bird', 'Tap to flap', '/flappy'],
  ['🟦 Tetris', 'Clear the lines', '/tetris'],
  ['🃏 Memory Match', 'Find all pairs', '/memory'],
  ['🏓 Pong', 'Beat the CPU', '/pong'],
  ['🧱 Brick Breaker', 'Break all bricks', '/breakout'],
  ['🔢 2048', 'Merge to 2048', '/2048'],
  ['🔨 Whack-a-Mole', 'Smash those moles', '/mole'],
  ['🚀 Space Shooter', 'Blast the invaders', '/shooter'],
  ['🎨 Simon Says', 'Repeat the pattern', '/simon'],
];

function button(name, display_text, id, extra = {}) {
  return {
    name,
    buttonParamsJson: JSON.stringify({ display_text, id, ...extra }),
  };
}

function copyButton(command) {
  return button('cta_copy', `📋 Copy ${command}`, command, { copy_code: command });
}

function replyButton(label, command) {
  return button('quick_reply', label, command);
}

function gamesText() {
  const classic = GAMES.slice(0, 7)
    .map(([name, desc, cmd]) => `${name}\n${desc}  •  ${cmd}`)
    .join('\n\n');
  const puzzle = GAMES.slice(7)
    .map(([name, desc, cmd]) => `${name}\n${desc}  •  ${cmd}`)
    .join('\n\n');

  return [
    '🎮 MINI GAMES',
    '13 games — use any command to play',
    '',
    '🎮 CLASSIC ARCADE',
    classic,
    '',
    '🧩 PUZZLE & BRAIN',
    puzzle,
    '',
    '📋 Tap a Copy button to put the command into your WhatsApp clipboard.',
  ].join('\n');
}

const cards = [
  {
    header: { title: '🎮 Mini Games' },
    body: gamesText(),
    footer: '13 games • Swipe →',
    buttons: [
      copyButton('/dino'),
      copyButton('/snake'),
      copyButton('/pong'),
      replyButton('🎮 Open Games', '/slidermenu games'),
    ],
  },
  {
    header: { title: '📖 Bot Command Directory' },
    body: [
      'ABIX GAMES',
      'Bot Command Directory',
      '40 commands — type any command in chat to launch',
      '',
      '🎮 CLASSIC ARCADE',
      '/dino • /snake • /flappy • /breakout',
      '/pong • /shooter • /mole • /subway',
      '',
      '🧩 PUZZLE & BRAIN',
      '/tetris • /2048 • /memory • /wordle',
      '/sliding • /simon',
      '',
      '⚡ TOOLS & BOT',
      'Your existing ABIX commands can be listed here later.',
    ].join('\n'),
    footer: 'Command Directory • Swipe →',
    buttons: [
      copyButton('/dino'),
      copyButton('/tetris'),
      copyButton('/memory'),
      replyButton('🏠 Main Menu', '/menu'),
    ],
  },
  {
    header: { title: '🏓 Pong' },
    body: [
      'ABIX GAMES',
      'Pong',
      '0 — 5',
      '',
      '🏓 CPU WINS',
      'Tap the command below to play again.',
      '',
      'Drag your paddle (left side)',
    ].join('\n'),
    footer: 'Game • /pong',
    buttons: [
      copyButton('/pong'),
      replyButton('🏓 Play Pong', '/pong'),
    ],
  },
  {
    header: { title: '🎵 TikTok Downloader' },
    body: [
      '🎵 TIKTOK DOWNLOADER 🎵',
      '',
      '👤 Author: TikTok Creator',
      '🎬 Title: Viral TikTok Video',
      '🌍 Region: PK',
      '⏱️ Duration: 00:31',
      '',
      '┌──────────────┬────────────┐',
      '│ STATISTIC    │ VALUE      │',
      '├──────────────┼────────────┤',
      '│ 👀 Views     │ 571.300    │',
      '│ ❤️ Likes     │ 155.000    │',
      '│ 💬 Comments  │ 2.180      │',
      '│ 🔄 Shares    │ 89.900     │',
      '│ 📥 Saves     │ 2.978      │',
      '└──────────────┴────────────┘',
    ].join('\n'),
    footer: 'TikTok • Swipe →',
    buttons: [
      replyButton('🎵 TT Search', '/ttsearch'),
      copyButton('/ttsearch'),
      replyButton('⬇️ Download', '/tiktok'),
    ],
  },
  {
    header: { title: '🧰 Media + AI' },
    body: [
      '🧰 MEDIA TOOLS',
      'Sticker, audio, image, video and conversion tools.',
      '',
      '🧠 AI FEATURES',
      'AI chat, generation and assistant commands.',
      '',
      'This is the fifth test card. More categories can be added later.',
    ].join('\n'),
    footer: 'Media + AI • Slider test complete',
    buttons: [
      replyButton('🧰 Media Cmds', '/wpmenu'),
      replyButton('🧠 AI Cmds', '/aimenu'),
      copyButton('/wpmenu'),
      copyButton('/aimenu'),
    ],
  },
];

async function handler(sock, message, args = [], context = {}) {
  const jid = message?.key?.remoteJid;
  if (!jid) return;

  try {
    return await sendInteractiveCarousel(sock, jid, {
      body: '🎛️ ABIX-AE SLIDER CHECKING',
      footer: 'Swipe left/right • Tap Copy to copy a command',
      cards,
    }, {
      quoted: message,
      nativeInteractive: true,
    });
  } catch (error) {
    console.error('[SLIDER] Native carousel failed:', error.message);
    return sock.sendMessage(jid, {
      text: [
        '🎛️ ABIX-AE SLIDER CHECKING',
        '',
        'Native carousel could not be rendered on this client.',
        '',
        cards.map((c, i) => `${i + 1}. ${c.header.title}\n${c.body.slice(0, 220)}`).join('\n\n'),
      ].join('\n'),
    }, { quoted: message });
  }
}

module.exports = {
  command: 'slidermenu',
  aliases: ['slidercheck', 'sliderchecking'],
  category: 'system',
  description: 'Five-card native WhatsApp slider test.',
  usage: '-slidermenu',
  cooldown: 3000,
  handler,
};
