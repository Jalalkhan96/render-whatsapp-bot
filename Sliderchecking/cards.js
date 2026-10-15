'use strict';

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

function btn(name, display_text, id, extra = {}) {
  return { name, buttonParamsJson: JSON.stringify({ display_text, id, ...extra }) };
}

function copy(command, label = `📋 Copy ${command}`) {
  return btn('cta_copy', label, command, { copy_code: command });
}

function reply(label, id) {
  return btn('quick_reply', label, id);
}

function gamesText() {
  const arcade = GAMES.slice(0, 7)
    .map(([name, desc, command]) => `${name}\n${desc}                                      ${command}`)
    .join('\n\n');
  const puzzle = GAMES.slice(7)
    .map(([name, desc, command]) => `${name}\n${desc}                                      ${command}`)
    .join('\n\n');

  return [
    'ABIX GAMES',
    '🎮  Mini Games',
    '13 games — type any command to play',
    '',
    '🎮  CLASSIC ARCADE',
    arcade,
    '',
    '🧩  PUZZLE & BRAIN',
    puzzle,
  ].join('\n');
}

function directoryText() {
  return [
    'ABIX GAMES',
    '📖  Bot Command Directory',
    '40 commands — type any in chat to launch',
    '',
    '🎮  CLASSIC ARCADE',
    'Dino Runner                         /dino',
    'Snake                               /snake',
    'Flappy Bird                         /flappy',
    'Brick Breaker                       /breakout',
    'Pong                                /pong',
    'Space Shooter                       /shooter',
    'Whack-a-Mole                        /mole',
    'Subway Rush                         /subway',
    '',
    '🧩  PUZZLE & BRAIN',
    'Tetris                              /tetris',
    '2048                                /2048',
    'Memory Match                        /memory',
    'Wordle                              /wordle',
    'Sliding Puzzle                      /sliding',
    '',
    '⚡  OTHER CATEGORIES',
    'Media • AI • Social • Group • News',
    'Use the existing ABIX category menus for their complete lists.',
  ].join('\n');
}

const cards = [
  {
    header: { title: '🎮 Mini Games' },
    body: gamesText(),
    footer: '13 games • Swipe →',
    buttons: [
      copy('/dino'), copy('/snake'), copy('/piano'), copy('/race'),
      copy('/flappy'), copy('/tetris'), copy('/memory'), copy('/pong'),
      copy('/breakout'), copy('/2048'), copy('/mole'), copy('/shooter'),
      copy('/simon'),
    ],
  },
  {
    header: { title: '📖 Bot Command Directory' },
    body: directoryText(),
    footer: 'Command Directory • Swipe →',
    buttons: [copy('/dino'), copy('/tetris'), copy('/memory'), copy('/pong')],
  },
  {
    header: { title: '🏓 Pong' },
    body: [
      'ABIX GAMES',
      'Pong',
      '0 — 5',
      '',
      '🏓  CPU WINS',
      'Tap to play again',
      '',
      'Drag your paddle (left side)',
    ].join('\n'),
    footer: 'Classic Arcade • /pong',
    buttons: [copy('/pong', '📋 Copy /pong'), reply('🏓 Play Pong', '/pong')],
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
    footer: 'TikTok Downloader • Swipe →',
    buttons: [copy('/ttsearch', '📋 Copy /ttsearch'), reply('🎵 TT Search', '/ttsearch'), copy('/tiktok', '📋 Copy /tiktok')],
  },
  {
    header: { title: '🧰 Media + AI' },
    body: [
      'ABIX GAMES',
      '🧰  MEDIA TOOLS',
      'Sticker, audio, image, video and conversion tools.',
      '',
      '🧠  AI FEATURES',
      'AI chat, generation and assistant commands.',
      '',
      'Tap a command button to copy it to your WhatsApp clipboard.',
    ].join('\n'),
    footer: 'Media + AI • Slider test',
    buttons: [
      copy('/wpmenu', '📋 Copy /wpmenu'),
      copy('/aimenu', '📋 Copy /aimenu'),
      reply('🧰 Media Cmds', '/wpmenu'),
      reply('🧠 AI Cmds', '/aimenu'),
    ],
  },
];

module.exports = { GAMES, cards };
