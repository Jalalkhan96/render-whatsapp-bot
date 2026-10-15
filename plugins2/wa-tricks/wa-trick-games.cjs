'use strict';

/**
 * ABIX-AE Game Arcade — client-safe edition.
 *
 * Design goal:
 * 1) Game/menu artwork is a normal image message rendered server-side.
 * 2) Game actions are direct native-flow quick-reply buttons attached to the
 *    same message. There is NO "OPEN CONTROLS" intermediate picker.
 * 3) No legacy ListMessage, no view-once wrapper, no quoted/fake-forward
 *    metadata, and no experimental HTML/JS message envelope is used.
 *
 * Important WhatsApp limitation: arbitrary JavaScript/canvas cannot execute
 * inside an image/chat bubble. The reliable in-chat model is therefore a
 * server-rendered game board + direct quick-reply actions. Each tap routes
 * back to the normal command system and the bot sends the updated board.
 */

const crypto = require('crypto');
const { generateWAMessageFromContent, prepareWAMessageMedia, proto } = require('@whiskeysockets/baileys');
const { renderer } = require('../../lib/html-bubble.cjs');
const { buildInteractiveAdditionalNodes } = require('../../lib/interactiveNodes');
const { ARCADE_CATALOG, resolveGame, getPfpDataUri, gameTemplate, personalizedHtml, buildGameMenuHtml } = require('./arcade-games.cjs');
const { sendNativeHtmlGameWithFallback } = require('../../lib/richHtmlGame.cjs');

const PREFIX = '-';
const MAX_SESSIONS = 256;
const SESSION_TTL_MS = 30 * 60 * 1000;

const sessions = new Map();

function now() { return Date.now(); }

function sessionKey(jid, sender, game) {
  return `${jid}|${sender || jid}|${game}`;
}

function cleanSessions() {
  const cutoff = now() - SESSION_TTL_MS;
  for (const [key, value] of sessions) {
    if (!value || value.updatedAt < cutoff) sessions.delete(key);
  }
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }
}

function getState(jid, sender, game, reset = false) {
  cleanSessions();
  const key = sessionKey(jid, sender, game);
  let state = sessions.get(key);
  if (!state || reset) {
    state = {
      id: crypto.randomUUID(),
      jid,
      sender,
      game,
      score: 0,
      best: 0,
      status: 'READY',
      tick: 0,
      direction: 'right',
      rpsUser: null,
      rpsBot: null,
      updatedAt: now(),
    };
    sessions.set(key, state);
  }
  state.updatedAt = now();
  return state;
}

function clampText(value, max = 80) {
  return String(value || '').slice(0, max);
}

function xml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escSvg(value) { return xml(value); }

function arcadePage(page = 1) {
  // The arcade is intentionally one long visual menu. Pagination used to
  // produce a second image and a legacy ListMessage; the latter is rejected
  // by current WhatsApp clients with "Update WhatsApp". Keep the numeric
  // argument for backward compatibility, but always render the full catalog.
  return { page: 1, totalPages: 1 };
}

function menuSvg(prefix = PREFIX) {
  const rows = ARCADE_CATALOG;
  const rowH = 46;
  const height = 150 + rows.length * rowH + 34;
  const rowSvg = rows.map((g, i) => {
    const y = 125 + i * rowH;
    return `<g>` +
      `<rect x="28" y="${y}" width="844" height="37" rx="10" fill="#111b31" stroke="#273658"/>` +
      `<text x="42" y="${y + 17}" fill="#f1f3fa" font-family="Arial,Segoe UI,sans-serif" font-size="16" font-weight="700">${escSvg(g.icon)} ${escSvg(g.name)}</text>` +
      `<text x="42" y="${y + 31}" fill="#7f8ca7" font-family="Arial,Segoe UI,sans-serif" font-size="10">${escSvg(g.desc)}</text>` +
      `<text x="858" y="${y + 23}" fill="#b996ff" font-family="monospace" font-size="12" font-weight="700" text-anchor="end">${escSvg(prefix + g.cmd)}</text>` +
      `</g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}" viewBox="0 0 900 ${height}">
    <rect width="900" height="${height}" fill="#080d19"/>
    <rect x="14" y="14" width="872" height="${height - 28}" rx="24" fill="#12182b" stroke="#593ec7" stroke-width="3"/>
    <text x="42" y="46" fill="#8d6cff" font-family="Arial,Segoe UI,sans-serif" font-size="11" letter-spacing="3">ABIX ARCADE</text>
    <text x="42" y="81" fill="#f5f2ff" font-family="Arial,Segoe UI,sans-serif" font-size="29" font-weight="800">🎮 GAME ARCADE</text>
    <text x="858" y="46" fill="#707c95" font-family="monospace" font-size="11" text-anchor="end">${rows.length} GAMES</text>
    <text x="42" y="104" fill="#8994aa" font-family="Arial,Segoe UI,sans-serif" font-size="12">Tap SELECT GAME below to open the complete command list.</text>
    ${rowSvg}
    <text x="42" y="${height - 15}" fill="#626e87" font-family="monospace" font-size="10">Every row maps directly to an ABIX command • no forwarded/channel envelope</text>
  </svg>`;
}

function gameControls(game, prefix = PREFIX) {
  const common = [
    { id: `${prefix}${game.cmd} restart`, title: '🔄 RESTART', description: 'Start a fresh round' },
  ];
  const controls = {
    dino: [
      { id: `${prefix}dino jump`, title: '🦖 JUMP', description: 'Jump over the cactus' },
      { id: `${prefix}dino run`, title: '🏃 RUN', description: 'Keep running' },
    ],
    flappy: [
      { id: `${prefix}flappy flap`, title: '🐤 FLAP', description: 'Fly upward' },
      { id: `${prefix}flappy wait`, title: '⏺ WAIT', description: 'Let the bird fall' },
    ],
    snake: [
      { id: `${prefix}snake up`, title: '⬆️ UP', description: 'Move up' },
      { id: `${prefix}snake down`, title: '⬇️ DOWN', description: 'Move down' },
      { id: `${prefix}snake left`, title: '⬅️ LEFT', description: 'Move left' },
      { id: `${prefix}snake right`, title: '➡️ RIGHT', description: 'Move right' },
    ],
    rps: [
      { id: `${prefix}rps rock`, title: '🪨 ROCK', description: 'Choose rock' },
      { id: `${prefix}rps paper`, title: '📄 PAPER', description: 'Choose paper' },
      { id: `${prefix}rps scissors`, title: '✂️ SCISSORS', description: 'Choose scissors' },
    ],
    tictactoe: [1,2,3,4,5,6,7,8,9].map(n => ({ id: `${prefix}tictactoe ${n}`, title: `#${n}`, description: `Place your move at ${n}` })),
    connect4: [1,2,3,4,5,6,7].map(n => ({ id: `${prefix}connect4 ${n}`, title: `COLUMN ${n}`, description: 'Drop your piece' })),
    breakout: [
      { id: `${prefix}breakout start`, title: '▶️ START', description: 'Launch breakout' },
      { id: `${prefix}breakout left`, title: '⬅️ LEFT', description: 'Move paddle left' },
      { id: `${prefix}breakout right`, title: '➡️ RIGHT', description: 'Move paddle right' },
    ],
    pong: [
      { id: `${prefix}pong left`, title: '⬅️ LEFT', description: 'Move paddle left' },
      { id: `${prefix}pong right`, title: '➡️ RIGHT', description: 'Move paddle right' },
      { id: `${prefix}pong hit`, title: '🏓 HIT', description: 'Return the ball' },
    ],
    shooter: [
      { id: `${prefix}shooter left`, title: '⬅️ LEFT', description: 'Move ship left' },
      { id: `${prefix}shooter right`, title: '➡️ RIGHT', description: 'Move ship right' },
      { id: `${prefix}shooter fire`, title: '🚀 FIRE', description: 'Shoot invaders' },
    ],
    simon: [
      { id: `${prefix}simon start`, title: '▶️ START', description: 'Start the sequence' },
      { id: `${prefix}simon red`, title: '🔴 RED', description: 'Repeat red' },
      { id: `${prefix}simon blue`, title: '🔵 BLUE', description: 'Repeat blue' },
      { id: `${prefix}simon green`, title: '🟢 GREEN', description: 'Repeat green' },
      { id: `${prefix}simon yellow`, title: '🟡 YELLOW', description: 'Repeat yellow' },
    ],
    tetris: [
      { id: `${prefix}tetris left`, title: '⬅️ LEFT', description: 'Move block left' },
      { id: `${prefix}tetris right`, title: '➡️ RIGHT', description: 'Move block right' },
      { id: `${prefix}tetris down`, title: '⬇️ DROP', description: 'Drop the block' },
    ],
    maze: [
      { id: `${prefix}maze up`, title: '⬆️ UP', description: 'Move toward the exit' },
      { id: `${prefix}maze down`, title: '⬇️ DOWN', description: 'Move toward the exit' },
      { id: `${prefix}maze left`, title: '⬅️ LEFT', description: 'Move toward the exit' },
      { id: `${prefix}maze right`, title: '➡️ RIGHT', description: 'Move toward the exit' },
    ],
  };
  return [...(controls[game.cmd] || [
    { id: `${prefix}${game.cmd} start`, title: '▶️ START / PLAY', description: `Play ${game.name}` },
    { id: `${prefix}${game.cmd} action`, title: '🎯 PLAY', description: 'Take a game action' },
  ]), ...common].slice(0, 10);
}

function gameSvg(game, state) {
  const accent = game.cmd === 'dino' ? '#ffae00' : game.cmd === 'flappy' ? '#3fe07f' : '#9b7bff';
  const title = `${game.icon} ${game.name}`;
  const score = Math.max(0, Number(state.score) || 0);
  const status = state.status || 'READY';
  let scene = '';

  if (game.cmd === 'dino') {
    const obstacleX = 650 - ((state.tick * 37) % 420);
    const jumpY = state.direction === 'jump' ? 390 : 455;
    scene = `<rect x="95" y="420" width="710" height="3" fill="#516079"/>
      <text x="170" y="${jumpY}" fill="#ffb31a" font-size="64">🦖</text>
      <text x="${obstacleX}" y="455" fill="#26c281" font-size="52">🌵</text>
      <line x1="95" y1="430" x2="805" y2="430" stroke="#273651" stroke-width="7" stroke-dasharray="18 18"/>`;
  } else if (game.cmd === 'flappy') {
    const y = 230 + ((state.tick * 23) % 150);
    const gap = 300;
    scene = `<rect x="95" y="130" width="18" height="300" rx="7" fill="#2b8a68"/>
      <rect x="765" y="80" width="18" height="155" rx="7" fill="#2b8a68"/>
      <text x="355" y="${y}" fill="#ffd23f" font-size="58">🐤</text>
      <text x="95" y="475" fill="#7e8aa3" font-family="monospace" font-size="13">TAP A CONTROL BELOW TO FLY</text>`;
  } else if (game.cmd === 'snake') {
    const cells = [];
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 10; x++) {
        cells.push(`<rect x="${115 + x * 60}" y="${150 + y * 45}" width="50" height="35" rx="7" fill="#101a30" stroke="#223251"/>`);
      }
    }
    const head = { right:[4,2], left:[5,2], up:[4,1], down:[4,3] }[state.direction] || [4,2];
    scene = `${cells.join('')}<text x="${115 + head[0] * 60 + 10}" y="${180 + head[1] * 45}" font-size="26">🟢</text><text x="650" y="420" font-size="28">🍎</text>`;
  } else if (game.cmd === 'rps') {
    scene = `<text x="170" y="245" font-size="60">${state.rpsUser === 'rock' ? '🪨' : state.rpsUser === 'paper' ? '📄' : state.rpsUser === 'scissors' ? '✂️' : '❓'}</text>
      <text x="390" y="245" fill="#687590" font-family="monospace" font-size="26">VS</text>
      <text x="610" y="245" font-size="60">${state.rpsBot === 'rock' ? '🪨' : state.rpsBot === 'paper' ? '📄' : state.rpsBot === 'scissors' ? '✂️' : '❓'}</text>
      <text x="450" y="355" fill="#8e9ab2" font-family="monospace" font-size="15" text-anchor="middle">${escSvg(state.rpsUser ? `${state.rpsUser.toUpperCase()} vs ${String(state.rpsBot).toUpperCase()}` : 'CHOOSE YOUR MOVE')}</text>`;
  } else {
    scene = `<rect x="115" y="155" width="670" height="285" rx="24" fill="#0e1629" stroke="#2a3a5a"/>
      <text x="450" y="275" fill="${accent}" font-family="Arial,Segoe UI,sans-serif" font-size="42" font-weight="800" text-anchor="middle">${escSvg(game.icon)} ${escSvg(game.name)}</text>
      <text x="450" y="320" fill="#8d98af" font-family="monospace" font-size="16" text-anchor="middle">TAP A CONTROL BELOW TO PLAY</text>
      <text x="450" y="380" fill="#6f7d98" font-family="monospace" font-size="13" text-anchor="middle">ACTION ${state.tick}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="610" viewBox="0 0 900 610">
    <rect width="900" height="610" fill="#080d19"/>
    <rect x="24" y="18" width="852" height="574" rx="28" fill="#12182b" stroke="${accent}" stroke-width="3"/>
    <rect x="52" y="42" width="300" height="52" rx="15" fill="#0d1527" stroke="${accent}" stroke-width="2"/>
    <text x="72" y="76" fill="#f6f2ff" font-family="Arial,Segoe UI,sans-serif" font-size="22" font-weight="800">${escSvg(title)}</text>
    <text x="840" y="76" fill="#7f8aa2" font-family="monospace" font-size="12" text-anchor="end">ABIX ARCADE</text>
    <g>
      <rect x="52" y="112" width="245" height="65" rx="14" fill="#0d1527" stroke="#233252"/>
      <text x="174" y="139" fill="#8390a9" font-family="monospace" font-size="11" text-anchor="middle" letter-spacing="2">SCORE</text>
      <text x="174" y="163" fill="${accent}" font-family="Arial,Segoe UI,sans-serif" font-size="25" font-weight="800" text-anchor="middle">${score}</text>
      <rect x="328" y="112" width="245" height="65" rx="14" fill="#0d1527" stroke="#233252"/>
      <text x="450" y="139" fill="#8390a9" font-family="monospace" font-size="11" text-anchor="middle" letter-spacing="2">BEST</text>
      <text x="450" y="163" fill="${accent}" font-family="Arial,Segoe UI,sans-serif" font-size="25" font-weight="800" text-anchor="middle">${Math.max(state.best || 0, score)}</text>
      <rect x="604" y="112" width="244" height="65" rx="14" fill="#0d1527" stroke="#233252"/>
      <text x="726" y="139" fill="#8390a9" font-family="monospace" font-size="11" text-anchor="middle" letter-spacing="2">STATUS</text>
      <text x="726" y="163" fill="${accent}" font-family="Arial,Segoe UI,sans-serif" font-size="21" font-weight="800" text-anchor="middle">${escSvg(status)}</text>
    </g>
    ${scene}
    <text x="450" y="548" fill="#68758e" font-family="Arial,Segoe UI,sans-serif" font-size="13" text-anchor="middle">Use the clickable WhatsApp controls sent below — no browser or download required.</text>
  </svg>`;
}

function rpsWinner(user, bot) {
  if (user === bot) return 'draw';
  if ((user === 'rock' && bot === 'scissors') ||
      (user === 'paper' && bot === 'rock') ||
      (user === 'scissors' && bot === 'paper')) return 'win';
  return 'loss';
}

function applyAction(state, action) {
  const a = String(action || '').toLowerCase();
  state.tick += 1;
  state.status = 'PLAYING';

  if (a === 'restart' || a === 'start' || a === 'play') {
    state.score = 0;
    state.tick = 0;
    state.status = 'READY';
    state.rpsUser = null;
    state.rpsBot = null;
    return state;
  }

  if (state.game === 'rps' && ['rock', 'paper', 'scissors'].includes(a)) {
    const choices = ['rock', 'paper', 'scissors'];
    state.rpsUser = a;
    state.rpsBot = choices[Math.floor(Math.random() * choices.length)];
    const result = rpsWinner(state.rpsUser, state.rpsBot);
    if (result === 'win') state.score += 1;
    state.status = result === 'win' ? 'WIN' : result === 'loss' ? 'LOSE' : 'DRAW';
    state.best = Math.max(state.best || 0, state.score);
    return state;
  }

  if (state.game === 'dino') {
    state.direction = a === 'jump' ? 'jump' : 'run';
    state.score += a === 'jump' ? 1 : 0;
    state.status = 'RUNNING';
    state.best = Math.max(state.best || 0, state.score);
    return state;
  }
  if (state.game === 'flappy') {
    state.score += a === 'flap' ? 1 : 0;
    state.status = 'FLYING';
    state.best = Math.max(state.best || 0, state.score);
    return state;
  }
  if (state.game === 'snake') {
    if (['up','down','left','right'].includes(a)) state.direction = a;
    state.score += 1;
    state.status = 'MOVING';
    state.best = Math.max(state.best || 0, state.score);
    return state;
  }

  if (a && a !== 'action') state.score += 1;
  state.best = Math.max(state.best || 0, state.score);
  return state;
}

function nativeQuickReplyButton(displayText, id) {
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({
      display_text: String(displayText).slice(0, 20),
      id: String(id),
    }),
  };
}

async function sendNativeFlowCard(sock, jid, { title, subtitle, body, footer, image, buttons }) {
  if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3) {
    throw new Error('Direct game controls require 1-3 quick replies');
  }

  const media = await prepareWAMessageMedia(
    { image },
    { upload: sock.waUploadToServer }
  );

  const interactive = proto.Message.InteractiveMessage.create({
    header: proto.Message.InteractiveMessage.Header.create({
      title: String(title || ''),
      subtitle: String(subtitle || ''),
      hasMediaAttachment: true,
      imageMessage: media.imageMessage,
    }),
    body: proto.Message.InteractiveMessage.Body.create({
      text: String(body || ''),
    }),
    footer: proto.Message.InteractiveMessage.Footer.create({
      text: String(footer || ''),
    }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons,
      messageParamsJson: '',
      messageVersion: 1,
    }),
    contextInfo: proto.ContextInfo.create({}),
  });

  const userJid = sock?.authState?.creds?.me?.id || sock?.user?.id;
  const generated = generateWAMessageFromContent(jid, {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
    },
    interactiveMessage: interactive,
  }, { userJid });

  await sock.relayMessage(jid, generated.message, {
    messageId: generated.key.id,
    additionalNodes: buildInteractiveAdditionalNodes(jid, true),
  });
  return generated;
}

async function sendArcadeMenu(sock, from, quotedMsg = null, page = 1, prefix = PREFIX) {
  const html = buildGameMenuHtml(prefix);
  return sendNativeHtmlGameWithFallback(sock, from, html, {
    title: '🎮 ABIX GAME MENU',
    trustedSources: ['nixel.dev'],
    quoted: quotedMsg,
    fallbackCaption: `🎮 ABIX GAME ARCADE\n${ARCADE_CATALOG.length} games • use the command shown in the HTML menu`,
    theme: 'dark',
  });
}

function directGameButtons(game, prefix = PREFIX) {
  const p = String(prefix || PREFIX);
  const c = game.cmd;
  const map = {
    dino: [['🦖 JUMP', `${p}dino jump`], ['🏃 DUCK', `${p}dino duck`], ['🔄 RESTART', `${p}dino restart`]],
    flappy: [['🐤 FLAP', `${p}flappy flap`], ['⏺ WAIT', `${p}flappy wait`], ['🔄 RESTART', `${p}flappy restart`]],
    snake: [['⬅️ LEFT', `${p}snake left`], ['⬆️ FORWARD', `${p}snake up`], ['➡️ RIGHT', `${p}snake right`]],
    rps: [['✊ ROCK', `${p}rps rock`], ['✋ PAPER', `${p}rps paper`], ['✌️ SCISSORS', `${p}rps scissors`]],
    breakout: [['⬅️ LEFT', `${p}breakout left`], ['➡️ RIGHT', `${p}breakout right`], ['🔄 RESTART', `${p}breakout restart`]],
    pong: [['⬆️ UP', `${p}pong up`], ['⬇️ DOWN', `${p}pong down`], ['🔄 RESTART', `${p}pong restart`]],
    shooter: [['⬅️ LEFT', `${p}shooter left`], ['🚀 FIRE', `${p}shooter fire`], ['➡️ RIGHT', `${p}shooter right`]],
    doom: [['⬅️ LEFT', `${p}doom left`], ['🔥 FIRE', `${p}doom fire`], ['➡️ RIGHT', `${p}doom right`]],
    galaxy: [['⬅️ LEFT', `${p}galaxy left`], ['🚀 FIRE', `${p}galaxy fire`], ['➡️ RIGHT', `${p}galaxy right`]],
    tetris: [['⬅️ LEFT', `${p}tetris left`], ['⬇️ DROP', `${p}tetris down`], ['➡️ RIGHT', `${p}tetris right`]],
    maze: [['⬆️ UP', `${p}maze up`], ['⬅️ LEFT', `${p}maze left`], ['➡️ RIGHT', `${p}maze right`]],
    connect4: [['COLUMN 1', `${p}connect4 1`], ['COLUMN 2', `${p}connect4 2`], ['COLUMN 3', `${p}connect4 3`]],
    tictactoe: [['#1', `${p}tictactoe 1`], ['#2', `${p}tictactoe 2`], ['#3', `${p}tictactoe 3`]],
    simon: [['🔴 RED', `${p}simon red`], ['🔵 BLUE', `${p}simon blue`], ['🟢 GREEN', `${p}simon green`]],
    casino: [['🎰 SPIN', `${p}casino spin`], ['🔄 AGAIN', `${p}casino restart`], ['📊 SCORE', `${p}casino score`]],
    math: [['➕ NEW', `${p}math new`], ['✅ CHECK', `${p}math check`], ['🔄 RESTART', `${p}math restart`]],
    trivia: [['🧠 NEW', `${p}trivia new`], ['✅ ANSWER', `${p}trivia answer`], ['🔄 RESTART', `${p}trivia restart`]],
    quiz: [['❓ NEW', `${p}quiz new`], ['✅ ANSWER', `${p}quiz answer`], ['🔄 RESTART', `${p}quiz restart`]],
    wyr: [['1️⃣ A', `${p}wyr a`], ['2️⃣ B', `${p}wyr b`], ['🔄 NEXT', `${p}wyr next`]],
    hangman: [['🔤 A-M', `${p}hangman a`], ['🔤 N-Z', `${p}hangman n`], ['🔄 RESTART', `${p}hangman restart`]],
    memory: [['🧩 FLIP 1', `${p}memory 1`], ['🧩 FLIP 2', `${p}memory 2`], ['🔄 RESTART', `${p}memory restart`]],
    mines: [['❔ CELL 1', `${p}mines 1`], ['❔ CELL 2', `${p}mines 2`], ['🔄 RESTART', `${p}mines restart`]],
    whack: [['🔨 HIT', `${p}whack hit`], ['🎯 HIT', `${p}whack hit2`], ['🔄 RESTART', `${p}whack restart`]],
    knifehit: [['🔪 THROW', `${p}knifehit throw`], ['🎯 AIM', `${p}knifehit aim`], ['🔄 RESTART', `${p}knifehit restart`]],
    stack: [['🧱 DROP', `${p}stack drop`], ['🎯 PLACE', `${p}stack place`], ['🔄 RESTART', `${p}stack restart`]],
    solars: [['☀️ EXPLORE', `${p}solars explore`], ['🪐 NEXT', `${p}solars next`], ['🔄 RESTART', `${p}solars restart`]],
    piano: [['🎹 C', `${p}piano c`], ['🎹 E', `${p}piano e`], ['🎹 G', `${p}piano g`]],
    car: [['⬅️ LEFT', `${p}car left`], ['⬆️ ACCEL', `${p}car accel`], ['➡️ RIGHT', `${p}car right`]],
    race: [['⬅️ LEFT', `${p}race left`], ['⬆️ ACCEL', `${p}race accel`], ['➡️ RIGHT', `${p}race right`]],
  };
  const fallback = [['▶️ PLAY', `${p}${c} start`], ['🎯 ACTION', `${p}${c} action`], ['🔄 RESTART', `${p}${c} restart`]];
  const list = map[c] || fallback;
  return list.map(([label, id]) => nativeQuickReplyButton(label, id));
}

async function sendGame(sock, from, cmd, quotedMsg = null, args = []) {
  const game = resolveGame(cmd);
  if (!game) return false;

  const pfp = await getPfpDataUri(sock, quotedMsg?.key?.participant || quotedMsg?.key?.senderPn || from);
  const dedicatedHtml = personalizedHtml(game, pfp);
  const html = dedicatedHtml || gameTemplate(game, pfp);

  const result = await sendNativeHtmlGameWithFallback(sock, from, html, {
    title: `${game.icon} ${game.name}`,
    trustedSources: ['nixel.dev'],
    quoted: quotedMsg,
    fallbackCaption: `🎮 ${game.name}\nSend -${game.cmd} to open it again.`,
    theme: 'dark',
  });
  return { mode: result.mode || 'native-html', game: game.cmd, result };
}

async function sendPersonalizedGame(sock, from, cmd, quotedMsg = null, args = []) {
  return sendGame(sock, from, cmd, quotedMsg, args);
}

async function handleGameCommand(sock, msg) {
  const text = (
    msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    ''
  ).trim();
  const parts = text.split(/\s+/);
  const first = String(parts.shift() || '').toLowerCase();
  const from = msg?.key?.remoteJid;
  if (!from) return false;
  const prefix = first.match(/^[^a-z0-9]/)?.[0] || PREFIX;
  const command = first.replace(/^[^a-z0-9]+/, '').toLowerCase();

  if (command === 'games' || command === 'arcade' || command === 'gamemenu') {
    await sendArcadeMenu(sock, from, null, Number(parts[0]) || 1, prefix);
    return true;
  }
  const game = resolveGame(command);
  if (!game) return false;
  await sendGame(sock, from, game.cmd, msg, parts);
  return true;
}

module.exports = {
  GAMES: ARCADE_CATALOG,
  PREFIX,
  sendArcadeMenu,
  sendPersonalizedGame,
  sendGame,
  getPfpDataUri,
  handleGameCommand,
  _sessions: sessions,
  menuSvg,
  gameSvg,
  gameControls,
};
