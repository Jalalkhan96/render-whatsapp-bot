const fs = require('fs');
const path = require('path');
const { patchSock } = require('./channelInfo');
const { sendMenuCard } = require('./interactiveMenu');
const { sendDedicatedMenu } = require('./menuCarousel');
const settings = require('../settings');
const { acquire, logBlocked } = require('./rateLimiter');
const menuState = require('./menuState');
const { getPermission, Permission, buildPermissionContext, checkPermission, needsAdminMetadata } = require('./permissions');
const { isBlockedAdultCommand, isBlockedAdultRequest } = require('./contentRestrictions');

function flagEnabled(value) {
  return value === true || value === 1 ||
    (typeof value === 'string' && ['true', '1', 'yes', 'on', 'enabled'].includes(value.trim().toLowerCase()));
}

function isOwnerRestricted(plugin) {
  const permission = getPermission(plugin);
  return permission === Permission.OWNER || permission === Permission.PRIMARY_OWNER;
}

const REMOVED_COMMANDS = new Set([
  'sudo', 'sudos', 'pair', 'pairing', 'clone', 'gitclone', 'gitclone2',
  'rent', 'rentbot', 'githubdl', 'githubdl2', 'paircode', 'pairingcode',
  ...require('./contentRestrictions').BLOCKED_ADULT_COMMANDS,
]);
const APIFY_SOCIAL_COMMANDS = new Set([
  'fbsearch', 'igsearch', 'linkedinjobs', 'linkedinpeople', 'linkedinposts',
  'pinsearch', 'redditsearch', 'snapprofile', 'threadsearch', 'ttsearch',
  'xsearch', 'ytsearch',
]);
const EASY_GAME_COMMANDS = new Set(['rps', 'coinflip', 'blackjack', 'memory', 'connect4', 'ht', 'slots', 'slot']);

// The native ABIX arcade is the authoritative implementation for these
// commands. Prefer the plugins2 arcade wrappers over legacy per-game plugins
// so all 31 games share the same native-HTML → SVG/interactive → text fallback
// chain. Existing legacy files remain untouched for compatibility.
const CARD_ENGINE_COMMANDS = new Set(['9696card', 'card']);

const NATIVE_ARCADE_COMMANDS = new Set([
  'trivia', 'wyr', 'rps', 'math', 'hangman', '2048', 'breakout', 'car',
  'casino', 'connect4', 'dino', 'doom', 'flappy', 'frogger', 'galaxy',
  'knifehit', 'maze', 'memory', 'mines', 'pong', 'quiz', 'snake', 'solars',
  'stack', 'tetris', 'tictactoe', 'whack', 'piano', 'race', 'shooter', 'simon'
]);

function sourceKey(filePath) {
  return path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/').toLowerCase();
}

function sourceRank(candidate) {
  const source = sourceKey(candidate.sourceFile);
  const command = String(candidate.plugin.command || '').toLowerCase();
  if (APIFY_SOCIAL_COMMANDS.has(command) && source.startsWith('plugins2/4tstyle/')) return 0;
  if (CARD_ENGINE_COMMANDS.has(command) && source.startsWith('plugins2/9696card/')) return -2;
  if (NATIVE_ARCADE_COMMANDS.has(command) && source.startsWith('plugins2/')) return -1;
  if (EASY_GAME_COMMANDS.has(command) && source.startsWith('plugin4/')) return 0;
  if (source.startsWith('plugins/')) return 1;
  if (source.startsWith('plugins2/')) return 2;
  if (source.startsWith('esportplugin/')) return 3;
  if (source.startsWith('plugin4/')) return 4;
  return 9;
}

function compareCandidates(left, right) {
  const rankDifference = sourceRank(left) - sourceRank(right);
  return rankDifference || sourceKey(left.sourceFile).localeCompare(sourceKey(right.sourceFile));
}

function containsRemovedName(plugin) {
  const names = [plugin?.command, ...(Array.isArray(plugin?.aliases) ? plugin.aliases : [])]
    .map((value) => String(value || '').trim().toLowerCase());
  return names.some((name) => REMOVED_COMMANDS.has(name) || isBlockedAdultCommand(name));
}

const categoryMenus = {
  admin: 'gcmenu',
  group: 'gcmenu',
  fun: 'funmenu',
  game: 'funmenu',
  games: 'funmenu',
  education: 'edumenu',
  study: 'studymenu',
  ai: 'aimenu',
  social: 'socialmenu',
  news: 'newsmenu',
  security: 'secmenu',
  stalk: 'stalkmenu',
  editor: 'editormenu',
  voice: 'voicemenu',
  media: 'wpmenu',
  download: 'wpmenu',
  cricket: 'cricmenu',
  esport: 'esportmenu',
  'spotify-tools': 'spltmenu',
};

class CommandHandler {
  constructor() {
    this.commands = new Map();
    this.aliases = new Map();
    this.categories = new Map();
    this.stats = new Map();
    this.cooldowns = new Map();
    this.cooldownSweepTimer = setInterval(() => this.pruneCooldowns(), 5 * 60 * 1000);
    this.cooldownSweepTimer.unref?.();
    this.disabledCommands = new Set();
    this.prefixlessCommands = new Map();
    this.loadedFiles = new Set();
    this.commandFiles = new Map();
    this.duplicateCommands = new Set();
    this.duplicateAliases = new Set();
    this.loadReport = {
      loaded: 0,
      duplicates: 0,
      duplicateAliases: 0,
      broken: 0,
      resolved: 0,
      resolvedAliases: 0,
      skipped: 0,
    };
    this.brokenPlugins = [];
    this.reloadTimer = null;
    this.watchPlugins();
  }

  pruneCooldowns() {
    const now = Date.now();
    const staleBefore = now - 30 * 60 * 1000;
    for (const [key, timestamp] of this.cooldowns) {
      if (timestamp < staleBefore) this.cooldowns.delete(key);
    }
    if (this.cooldowns.size <= 20000) return;
    while (this.cooldowns.size > 15000) {
      const oldest = this.cooldowns.keys().next();
      if (oldest.done) break;
      this.cooldowns.delete(oldest.value);
    }
  }

  watchPlugins() {
    const pathsToWatch = [
      path.join(__dirname, '../plugins'),
      path.join(__dirname, '../plugins2'),
      path.join(__dirname, '../esportplugin'),
      path.join(__dirname, '../plugin4')
    ];

    pathsToWatch.forEach(pluginsPath => {
      if (!fs.existsSync(pluginsPath)) {
        try { fs.mkdirSync(pluginsPath); } catch (e) {} // Auto-create if not exists
        if (!fs.existsSync(pluginsPath)) return;
      }

      fs.watch(pluginsPath, (eventType, filename) => {
        if (filename && filename.endsWith('.js')) {
          const filePath = path.join(pluginsPath, filename);
          try {
            if (fs.existsSync(filePath)) {
              this.scheduleReload(`${filename} changed in ${path.basename(pluginsPath)}`);
            }
          } catch (error) {
            console.error(`[WATCHER] Error reloading ${filename}:`, error.message);
          }
        }
      });
    });
  }

  scheduleReload(reason) {
    clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      try {
        this.reloadCommands();
        console.log(`[WATCHER] Reloaded command registry: ${reason}`);
      } catch (error) {
        console.error(`[WATCHER] Registry reload failed: ${error.message}`);
      }
    }, 250);
    this.reloadTimer.unref?.();
  }

  _collectJsFiles(dir, out = []) {
    const SKIP_DIRECTORIES = new Set([
      'node_modules', '.git', 'tests', 'test', '__tests__', 'engines',
      '__snapshots__', 'fixtures', 'coverage', 'dist', 'build',
    ]);
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    for (const ent of entries) {
      if (ent.isDirectory() && SKIP_DIRECTORIES.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        this._collectJsFiles(full, out);
      } else if (ent.name.endsWith('.js')) {
        out.push(full);
      }
    }
    return out;
  }

  loadCommands() {
    this.loadReport = {
      loaded: 0,
      duplicates: 0,
      duplicateAliases: 0,
      broken: 0,
      resolved: 0,
      resolvedAliases: 0,
      skipped: 0,
    };
    this.brokenPlugins = [];
    this.loadedFiles.clear();
    const pathsToLoad = [
      path.join(__dirname, '../plugins'),
      path.join(__dirname, '../plugins2'),
      path.join(__dirname, '../esportplugin'),
      path.join(__dirname, '../plugin4')
    ];

    const candidates = [];
    for (const pluginsPath of pathsToLoad) {
      if (!fs.existsSync(pluginsPath)) continue;
      const files = this._collectJsFiles(pluginsPath).sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)));
      for (const filePath of files) {
        if (this.loadedFiles.has(filePath)) continue;
        this.loadedFiles.add(filePath);
        try {
          delete require.cache[require.resolve(filePath)];
          const exported = require(filePath);
          const plugins = exported?.command ? [exported] : (this._isPluginArray(exported) ? exported : []);
          for (const plugin of plugins) {
            const commandName = String(plugin?.command || '').trim().toLowerCase();
            if (containsRemovedName(plugin)) {
              this.loadReport.skipped++;
              continue;
            }
            if (!commandName || !/^[a-z0-9][a-z0-9_-]*$/.test(commandName) || typeof plugin?.handler !== 'function') {
              this.loadReport.broken++;
              this.brokenPlugins.push({
                file: sourceKey(filePath),
                error: 'Invalid command metadata or missing handler',
              });
              continue;
            }
            candidates.push({ plugin, sourceFile: filePath });
          }
        } catch (error) {
          this.brokenPlugins.push({ file: sourceKey(filePath), error: error.message });
          this.loadReport.broken++;
          console.error(`[COMMAND LOAD] ${sourceKey(filePath)}: ${error.message}`);
        }
      }
    }

    // Resolve duplicate command declarations deterministically without dropping
    // functionality: choose the preferred implementation and merge every
    // non-conflicting alias from the other implementations into it.
    const commandGroups = new Map();
    for (const candidate of candidates) {
      const key = String(candidate.plugin.command).toLowerCase();
      if (!commandGroups.has(key)) commandGroups.set(key, []);
      commandGroups.get(key).push(candidate);
    }

    const byCommand = new Map();
    for (const [key, group] of commandGroups) {
      group.sort(compareCandidates);
      const winner = group[0];
      const mergedAliases = new Set();
      for (const item of group) {
        for (const alias of (Array.isArray(item.plugin.aliases) ? item.plugin.aliases : [])) {
          const normalized = String(alias || '').trim().toLowerCase();
          if (normalized && normalized !== key && !REMOVED_COMMANDS.has(normalized)) mergedAliases.add(normalized);
        }
      }
      winner.plugin = { ...winner.plugin, aliases: [...mergedAliases] };
      if (group.length > 1) this.loadReport.resolved += group.length - 1;
      byCommand.set(key, winner);
    }

    const selected = [...byCommand.values()].sort(compareCandidates);
    const commandNames = new Set(byCommand.keys());
    const aliasWinners = new Map();
    for (const candidate of selected) {
      const aliases = [...new Set((candidate.plugin.aliases || []).map((alias) => String(alias).toLowerCase()))]
        .filter((alias) => alias && !commandNames.has(alias) && !REMOVED_COMMANDS.has(alias));
      candidate.plugin = { ...candidate.plugin, aliases };
      for (const alias of aliases) {
        const previous = aliasWinners.get(alias);
        if (!previous || compareCandidates(candidate, previous) < 0) {
          if (previous) this.loadReport.resolvedAliases++;
          aliasWinners.set(alias, candidate);
        } else {
          this.loadReport.resolvedAliases++;
        }
      }
    }

    for (const candidate of selected) {
      const aliases = candidate.plugin.aliases.filter((alias) => aliasWinners.get(alias) === candidate);
      this.registerCommand({ ...candidate.plugin, aliases }, { sourceFile: candidate.sourceFile });
    }
  }

  _isPluginArray(plugin) {
    return Array.isArray(plugin) && plugin.every(p => p && typeof p === 'object' && p.command);
  }

  registerCommand(plugin, options = {}) {
    const { command, aliases = [], category = 'misc', handler } = plugin;

    // Final registration guard: adult commands and aliases are never installed.
    if (isBlockedAdultCommand(command) || aliases.some(isBlockedAdultCommand)) {
      this.loadReport.skipped++;
      return false;
    }

    // INTEGRITY CHECK
    if (!command || typeof handler !== 'function') {
      console.error(`[SKIP] Plugin at ${command || 'unknown'} is missing a valid command name or handler function.`);
      return;
    }

    const cmdKey = command.toLowerCase();

    // Keep the first discovered implementation deterministic. A duplicate
    // must never silently replace a working command.
    const existingSource = this.commandFiles.get(cmdKey);
    if (this.commands.has(cmdKey) && !(options.replaceSource && existingSource === options.sourceFile)) {
      this.duplicateCommands.add(cmdKey);
      this.loadReport.duplicates++;
      console.warn(`[DUPLICATE] Command "${cmdKey}" skipped; first registration kept.`);
      return false;
    }

    if (options.replaceSource && existingSource === options.sourceFile) {
      this.commands.delete(cmdKey);
      for (const [alias, target] of this.aliases) {
        if (target === cmdKey) this.aliases.delete(alias);
      }
      this.categories.forEach(commands => {
        const index = commands.indexOf(plugin.command);
        if (index !== -1) commands.splice(index, 1);
      });
    }

    this.stats.set(cmdKey, {
      calls: 0,
      errors: 0,
      totalTime: 0n, 
      avgMs: 0
    });

    const monitoredHandler = async (sock, message, ...args) => {
      const s = this.stats.get(cmdKey);
      
      patchSock(sock);
      
      if (this.disabledCommands.has(cmdKey)) {
        return await sock.sendMessage(message.key.remoteJid, { 
          text: `🚫 The command *${cmdKey}* is currently disabled.` 
        }, { quoted: message });
      }

      const commandArgs = Array.isArray(args[0]) ? args[0] : [];
      const rawArgs = commandArgs.map(value => String(value)).join(' ');
      if (isBlockedAdultRequest(cmdKey, rawArgs)) {
        return sock.sendMessage(message.key.remoteJid, { text: '🚫 Adult commands and sources are disabled for everyone.' }, { quoted: message });
      }
      const context = args[1] || {};
      const senderId = context.senderId || message.key.participant || message.key.remoteJid;
      let permissionContext = context;
      const isGroup = String(message.key.remoteJid || '').endsWith('@g.us');
      let isSenderAdmin = Boolean(context?.isSenderAdmin);
      let isBotAdmin = Boolean(context?.isBotAdmin);
      if (isGroup && needsAdminMetadata(plugin) && (!Object.prototype.hasOwnProperty.call(context, 'isSenderAdmin') || !Object.prototype.hasOwnProperty.call(context, 'isBotAdmin'))) {
        const isAdmin = require('./isAdmin');
        const status = await isAdmin(sock, message.key.remoteJid, senderId);
        isSenderAdmin = status.isSenderAdmin;
        isBotAdmin = status.isBotAdmin;
      }
      permissionContext = await buildPermissionContext({
        sock,
        message,
        chatId: message.key.remoteJid,
        senderId,
        isGroup,
        isSenderAdmin,
        isBotAdmin,
      });
      const access = checkPermission(plugin, permissionContext);
      if (!access.allowed) {
        return sock.sendMessage(message.key.remoteJid, { text: `❌ ${access.reason}` }, { quoted: message });
      }
      if (cmdKey.endsWith('menu') && ['on', 'off'].includes(String(commandArgs[0] || '').toLowerCase())) {
        const enabled = String(commandArgs[0]).toLowerCase() === 'on';
        const requesterAuthorized = Boolean(permissionContext.isOwner ||
          (cmdKey === 'gcmenu' && permissionContext.isGroup && permissionContext.isSenderAdmin));
        if (!requesterAuthorized) {
          return await sock.sendMessage(message.key.remoteJid, {
            text: '❌ Only a configured owner or an authorized group admin can change menu status.',
          }, { quoted: message });
        }
        if (cmdKey === 'gcmenu' && enabled && (!permissionContext.isGroup || !permissionContext.isBotAdmin || (!permissionContext.isSenderAdmin && !permissionContext.isOwner))) {
          return await sock.sendMessage(message.key.remoteJid, {
            text: !permissionContext.isGroup
              ? '❌ Group Menu can only be enabled inside a group.'
              : '❌ I need to be a group admin first.\nMake me admin and try again.',
          }, { quoted: message });
        }
        menuState.setMenuEnabled(cmdKey, enabled, cmdKey === 'gcmenu' ? message.key.remoteJid : null);
        return await sock.sendMessage(message.key.remoteJid, {
          text: `✅ ${cmdKey.toUpperCase()} is now ${enabled ? 'ON' : 'OFF'}.`,
        }, { quoted: message });
      }

      // takeIDEA-compatible admin-only group mode. It applies only to public
      // commands and never overrides configured owner or explicit admin rules.
      if (permissionContext.isGroup && cmdKey !== 'adminonly') {
        const adminOnlyEnabled = await require('./adminOnly').isEnabled(message.key.remoteJid);
        if (adminOnlyEnabled && getPermission(plugin) === Permission.PUBLIC && !permissionContext.isOwner) {
          if (!permissionContext.isSenderAdmin) {
            const admin = require('./isAdmin');
            const status = await admin(sock, message.key.remoteJid, senderId);
            permissionContext.isSenderAdmin = Boolean(status.isSenderAdmin);
            permissionContext.isBotAdmin = Boolean(status.isBotAdmin);
          }
          if (!permissionContext.isSenderAdmin) {
            return sock.sendMessage(message.key.remoteJid, { text: '🛡️ This group is in *ADMIN ONLY* mode. Only group admins can use public bot commands.' }, { quoted: message });
          }
        }
      }

      const gate = categoryMenus[String(plugin.category || '').toLowerCase()];
      if (gate && this.commands.has(gate) && !menuState.isMenuEnabled(gate, message.key.remoteJid) &&
          cmdKey !== gate && !cmdKey.endsWith('menu')) {
        const prefix = settings.prefixes[0] || '۞';
        return await sock.sendMessage(message.key.remoteJid, {
          text: `❌ ${gate.toUpperCase()} is OFF.\nUse ${prefix}${gate} on first.`,
        }, { quoted: message });
      }

      const rate = acquire(plugin, message, commandArgs, Boolean(context?.isInteraction));
      if (!rate.allowed) {
        logBlocked(rate);
        return;
      }

      const userId = message.key.participant || message.key.remoteJid;
      const now = Date.now();
      const cooldownKey = `${userId}_${cmdKey}`;
      const interaction = Boolean(args[1]?.isInteraction);

      const configuredCooldownSeconds = Number(settings.commandCooldowns?.[cmdKey]);
      const configuredCooldownMs = Number.isFinite(configuredCooldownSeconds)
        ? Math.max(0, configuredCooldownSeconds * 1000)
        : null;
      const effectiveCooldownMs = configuredCooldownMs ?? plugin.cooldown ?? settings.commandCooldownMs;

      if (!interaction && this.cooldowns.has(cooldownKey)) {
        const expirationTime = this.cooldowns.get(cooldownKey) + effectiveCooldownMs;
        if (now < expirationTime) {
          rate.release();
          return;
        }
      }
      
      if (!interaction) this.cooldowns.set(cooldownKey, now);
      const start = process.hrtime.bigint();
      
      try {
        s.calls++;

        // The main -menu keeps the native interactive menu flow.
        // Every other *menu command with no operational sub-action gets the
        // dedicated full-command list renderer with the bot's existing
        // fake-forward styling. Operational
        // sub-actions (e.g. -cricmenu babar) still go to their real plugin.
        const isMainMenu = cmdKey === 'menu';
        const isOnlyMenu = cmdKey === 'onlymenu';
        const isNativeSliderMenu = cmdKey === 'slidermenu';
        const firstArg = String(commandArgs[0] || '').toLowerCase();
        const isMenuPageRequest = !firstArg || firstArg === 'page' || /^\d+$/.test(firstArg);
        const isDedicatedMenuCommand = !isMainMenu && !isOnlyMenu && !isNativeSliderMenu && plugin.dedicatedMenu !== false && cmdKey !== 'game4menu' && cmdKey !== 'gifmenu' && cmdKey !== 'ppmenu' && cmdKey.endsWith('menu') && isMenuPageRequest;

        if (isDedicatedMenuCommand) {
          const prefix = context.prefix || settings.prefixes[0] || '-';
          return await sendDedicatedMenu(
            sock, message, message.key.remoteJid, this, prefix, cmdKey, commandArgs
          );
        }

        const responseDelay = Math.max(0, Math.min(30, Number(settings.responseDelay || 0)));
        if (responseDelay > 0) {
            await sock.sendPresenceUpdate('composing', message.key.remoteJid);
            await new Promise(resolve => setTimeout(resolve, responseDelay * 1000));
        }

        if (!isMainMenu) {
          return await handler(sock, message, ...args);
        }

        const menuSock = Object.create(sock);
        menuSock.sendMessage = async (jid, content, options) => {
          const skipMenuCard = Boolean(content?._skipMenuCard);
          if (skipMenuCard) {
            const plainContent = { ...content };
            delete plainContent._skipMenuCard;
            return sock.sendMessage(jid, plainContent, options);
          }
          const isSpecial = content && typeof content === 'object' && (
            'react' in content ||
            'delete' in content ||
            'update' in content ||
            'pollUpdate' in content ||
            'interactiveMessage' in content ||
            'buttons' in content ||
            'list' in content
          );
          if (isSpecial || !content || typeof content !== 'object') {
            return sock.sendMessage(jid, content, options);
          }

          return sendMenuCard(sock, jid, content, {
            quoted: options?.quoted || message,
            prefix: settings.prefixes[0] || '.',
            title: `${settings.botName || 'ABIX'} • ${cmdKey.toUpperCase()}`,
            footer: `${settings.botName || 'ABIX'} • Interactive Menu`,
          });
        };

        return await handler(menuSock, message, ...args);
      } catch (err) {
        s.errors++;
        throw err;
      } finally {
        const end = process.hrtime.bigint();
        s.totalTime += (end - start);
        s.avgMs = Number(s.totalTime / BigInt(s.calls || 1)) / 1_000_000;
        rate.release();
      }
    };

    this.commands.set(cmdKey, {
      ...plugin,
      command,
      handler: monitoredHandler,
      category: category.toLowerCase(),
      aliases
    });
    this.commandFiles.set(cmdKey, options.sourceFile || this.commandFiles.get(cmdKey) || null);

    for (const alias of aliases) {
      const aliasKey = String(alias).toLowerCase();
      const existing = this.aliases.get(aliasKey) || this.commands.has(aliasKey) ? (this.aliases.get(aliasKey) || aliasKey) : null;
      if (existing && existing !== cmdKey) {
        this.duplicateAliases.add(aliasKey);
        this.loadReport.duplicateAliases++;
        console.warn(`[DUPLICATE] Alias "${aliasKey}" skipped; first registration kept.`);
        continue;
      }
      this.aliases.set(aliasKey, cmdKey);
    }
    
    if (!this.categories.has(category.toLowerCase())) {
      this.categories.set(category.toLowerCase(), []);
    }
    
    if (!this.categories.get(category.toLowerCase()).includes(command)) {
       this.categories.get(category.toLowerCase()).push(command);
       return true;
    }
  }

  toggleCommand(name) {
    const cmd = name.toLowerCase();
    if (this.disabledCommands.has(cmd)) {
      this.disabledCommands.delete(cmd);
      return 'enabled';
    } else {
      this.disabledCommands.add(cmd);
      return 'disabled';
    }
  }

  _levenshtein(a, b) {
    const tmp = [];
    for (let i = 0; i <= a.length; i++) tmp[i] = [i];
    for (let j = 0; j <= b.length; j++) tmp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        tmp[i][j] = Math.min(
          tmp[i - 1][j] + 1,
          tmp[i][j - 1] + 1,
          tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return tmp[a.length][b.length];
  }

  findSuggestion(cmd) {
    const allNames = [...this.commands.keys(), ...this.aliases.keys()]
      .filter(name => {
        const target = this.commands.get(name) || this.commands.get(this.aliases.get(name));
        return !target || !isOwnerRestricted(target);
      });
    let bestMatch = null;
    let minDistance = 3;

    for (const name of allNames) {
      const distance = this._levenshtein(cmd, name);
      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = name;
      }
    }
    return bestMatch;
  }

  getDiagnostics() {
    return Array.from(this.stats.entries()).map(([name, data]) => ({
      command: name,
      usage: data.calls,
      errors: data.errors,
      average_speed: `${data.avgMs.toFixed(3)}ms`,
      status: this.disabledCommands.has(name) ? 'OFF' : 'ON'
    })).sort((a, b) => b.usage - a.usage);
  }

  resetStats() {
    this.stats.clear();
    this.cooldowns.clear();
    for (const cmd of this.commands.keys()) {
      this.stats.set(cmd, { calls: 0, errors: 0, totalTime: 0n, avgMs: 0 });
    }
  }

  reloadCommands() {
    this.commands.clear();
    this.commandFiles.clear();
    this.aliases.clear();
    this.categories.clear();
    this.stats.clear();
    this.cooldowns.clear();
    this.disabledCommands.clear();
    this.prefixlessCommands.clear();
    this.duplicateCommands.clear();
    this.duplicateAliases.clear();
    this.loadCommands();
  }

  getCommandInventory() {
    return [...this.commands.values()].map((command) => ({
      command: command.command,
      aliases: Array.isArray(command.aliases) ? [...command.aliases] : [],
      category: String(command.category || 'misc'),
      permission: getPermission(command),
      source: this.commandFiles.get(String(command.command).toLowerCase()) || null,
      status: this.disabledCommands.has(String(command.command).toLowerCase()) ? 'OFF' : 'ON',
    })).sort((a, b) => String(a.command).localeCompare(String(b.command)));
  }

  getLoadReport() {
    return {
      loaded: this.commands.size,
      duplicates: this.duplicateCommands.size,
      duplicateAliases: this.duplicateAliases.size,
      broken: this.brokenPlugins.length,
      resolved: this.loadReport.resolved,
      resolvedAliases: this.loadReport.resolvedAliases,
      skipped: this.loadReport.skipped,
      sourceFiles: this.loadedFiles.size,
      brokenPlugins: this.brokenPlugins.map((entry) => ({ ...entry })),
      commandInventory: this.getCommandInventory(),
    };
  }

  getCommand(text, prefixes) {
    const input = String(text || '').trim();
    const safePrefixes = Array.isArray(prefixes) && prefixes.length ? prefixes : ['-'];
    const usedPrefix = safePrefixes.find(p => input.startsWith(p));

    // Canonical command prefix is '-'. Do not accept legacy '.', '$', '/', or prefixless commands.
    if (!usedPrefix) return null;

    const commandBody = input.slice(usedPrefix.length).trim();
    const parts = commandBody.split(/\s+/);
    const fullCommand = String(parts.shift() || '').toLowerCase();
    const argumentText = parts.join(' ');

    // Check before looking in the registry, so old commands/aliases cannot
    // return suggestions or remain callable after an upgrade.
    if (isBlockedAdultRequest(fullCommand, argumentText)) {
      return {
        command: fullCommand,
        handler: async (sock, message) => sock.sendMessage(message.key.remoteJid, {
          text: '🚫 Adult commands and sources are disabled for everyone.',
        }, { quoted: message }),
      };
    }

    if (this.commands.has(fullCommand)) {
      return this.commands.get(fullCommand);
    }
    if (this.aliases.has(fullCommand)) {
      const mainCommand = this.aliases.get(fullCommand);
      return this.commands.get(mainCommand);
    }

    const suggestion = this.findSuggestion(fullCommand);
    if (suggestion) {
      return {
        command: suggestion,
        handler: async (sock, message) => {
          const chatId = message.key.remoteJid;
          await sock.sendMessage(chatId, { 
            text: `❓ Did you mean *${usedPrefix}${suggestion}*?` 
          }, { quoted: message });
        }
      };
    }

    return null;
  }

  getCommandsByCategory(category) {
    return this.categories.get(category.toLowerCase()) || [];
  }
}

module.exports = new CommandHandler();
        
