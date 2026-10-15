const axios = require('axios');

const HTTP_TIMEOUT = 20000;

const INFO_ENDPOINTS = [
  'https://api2.nftoken.info/player-info',
  'https://api2.nftoken.info/get',
  process.env.FF_INFO_API || 'https://developers.freefirecommunity.com/api/v1/info',
  process.env.FF_INFO_API_2 || 'https://freefireinfo-zy9l.onrender.com/api/v1/player-info',
  'https://free-ff-api-src-5plp.onrender.com/api/v1/account',
  'http://raw.thug4ff.xyz/info',
  'https://raw.thug4ff.xyz/info'
];

const BAN_ENDPOINTS = [
  process.env.FF_BAN_API || 'https://developers.freefirecommunity.com/api/v1/bancheck',
  'https://www.freefireapi.me/api/ban'
];

const SEARCH_ENDPOINTS = [
  process.env.FF_SEARCH_API || 'https://freefireinfo-zy9l.onrender.com/api/v1/search-players'
];

const ITEM_SOURCE = 'https://raw.githubusercontent.com/iamaanahmad/FreeFireItems/main/data/ItemData.json';

const VALID_KEY = process.env.FF_API_KEY || 'great';

function validateUid(uid) {
  return /^\d{6,15}$/.test(String(uid || '').trim());
}

function commonHeaders() {
  return {
    'User-Agent': 'ABIX-AE-FreeFire/1.0',
    'Accept': 'application/json',
    ...(process.env.FF_API_KEY ? { 'x-api-key': process.env.FF_API_KEY } : {})
  };
}

async function fetchInfo(uid, region) {
  const cleanUid = String(uid || '').trim();
  if (!validateUid(cleanUid)) {
    const error = new Error('UID must be a number between 6 and 15 digits.');
    error.code = 'INVALID_UID';
    throw error;
  }

  const safeRegion = String(region || 'ind').toLowerCase().trim();
  let lastError;

  for (const endpoint of INFO_ENDPOINTS) {
    try {
      const params = {};
      const isCommunity = endpoint.includes('developers.freefirecommunity.com');
      const isFreeSrc = endpoint.includes('free-ff-api-src');
      const isNftoken = endpoint.includes('nftoken.info');

      if (isCommunity) {
        params.region = safeRegion;
        params.uid = cleanUid;
      } else if (isFreeSrc) {
        params.region = safeRegion.toUpperCase();
        params.uid = cleanUid;
      } else if (isNftoken) {
        params.uid = cleanUid;
      } else {
        params.uid = cleanUid;
        params.region = safeRegion;
        params.key = VALID_KEY;
      }

      const { data } = await axios.get(endpoint, {
        params,
        timeout: endpoint.includes('nftoken.info') ? 30000 : HTTP_TIMEOUT,
        headers: commonHeaders()
      });

      if (data && typeof data === 'object') {
        if (!data.error && !data.errorMessage) {
          if (isCommunity && data.success === false) {
            lastError = new Error(data.message || 'Player was not found.');
            continue;
          }
          if (data.basicInfo || data.data?.basicInfo) {
            const resolved = data.data?.basicInfo ? { ...data, basicInfo: data.data.basicInfo } : data;
            return resolved;
          }
          if (data.accountid || data.nickname) {
            return { basicInfo: data };
          }
          if (isNftoken && data.AccountInfo) {
            return normalizeNftoken(data, cleanUid);
          }
          lastError = new Error('Player was not found.');
          continue;
        }
        lastError = new Error(data.error?.message || data.error || data.message || 'Player was not found.');
        continue;
      }

      lastError = new Error('Invalid response from Free Fire API.');
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError?.response?.status === 404
    ? 'Player UID was not found.'
    : 'Free Fire API is unavailable right now. Please try again later.');
}

function normalizeNftoken(data, uid) {
  const info = data.AccountInfo || {};
  const region = info.AccountRegion || data.RegionCode || data.region || 'UNKNOWN';
  return {
    basicInfo: {
      accountId: info.AccountUID || uid,
      nickname: info.AccountName || 'Unknown',
      level: info.AccountLevel || 0,
      exp: info.AccountEXP || 0,
      region: region,
      regionCode: region,
      rankingPoints: info.AccountRankPoint ?? info.BRRankPoints ?? info.AccountRankingPoint ?? 0,
      csRankingPoints: info.AccountCsRankPoint ?? info.CSRankPoints ?? info.AccountCsRankingPoint ?? 0,
      liked: info.AccountLikes ?? info.AccountLiked ?? 0,
      badgeCnt: info.AccountBPBadges ?? info.AccountBadgeCount ?? 0,
      honorScore: info.AccountHonorScore ?? 0,
      createAt: info.AccountCreateTime ? String(info.AccountCreateTime) : undefined,
      lastLoginAt: info.AccountLastLogin ? String(info.AccountLastLogin) : undefined
    },
    clanBasicInfo: data.GuildInfo || data.guild || {},
    petInfo: data.PetInfo || data.petInfo || {},
    profileInfo: data.ProfileInfo || data.profileInfo || {}
  };
}

async function fetchBan(uid) {
  const cleanUid = String(uid || '').trim();
  if (!validateUid(cleanUid)) {
    throw new Error('UID must be a number between 6 and 15 digits.');
  }

  let lastError;
  for (const endpoint of BAN_ENDPOINTS) {
    try {
      const { data } = await axios.get(endpoint, {
        params: { uid: cleanUid },
        timeout: HTTP_TIMEOUT,
        headers: commonHeaders()
      });
      if (data && typeof data === 'object' && !data.error) return data;
      lastError = new Error(data?.error?.message || data?.error || 'Ban check failed.');
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(lastError?.response?.status === 404
    ? 'Player UID was not found.'
    : 'Free Fire ban API is unavailable right now.');
}

async function searchPlayers(keyword, server) {
  const clean = String(keyword || '').trim();
  if (clean.length < 3) {
    throw new Error('Keyword must be at least 3 characters.');
  }

  let lastError;
  for (const endpoint of SEARCH_ENDPOINTS) {
    try {
      const { data } = await axios.get(endpoint, {
        params: { keyword: clean, server: String(server || 'IND').toUpperCase() },
        timeout: HTTP_TIMEOUT,
        headers: commonHeaders()
      });
      if (data && typeof data === 'object') {
        const list = data.infos || data.results || data.players || (Array.isArray(data) ? data : []);
        if (list && list.length) return list;
        lastError = new Error(data.message || 'No players found.');
        continue;
      }
      lastError = new Error('Invalid response from search API.');
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(lastError?.message?.includes('No players')
    ? 'No players found.'
    : 'Free Fire search API is unavailable right now.');
}

function basic(data) {
  return data?.basicInfo || data?.basic || data?.player || data?.data?.basicInfo || {};
}

function guild(data) {
  return data?.clanBasicInfo || data?.guildInfo || data?.clan || {};
}

function skill(data) {
  return data?.profileInfo || data?.petInfo || data?.skills || {};
}

function field(value, fallback = 'N/A') {
  return value === undefined || value === null || value === '' ? fallback : value;
}

function profileText(data, title = 'FREE FIRE PROFILE') {
  const player = basic(data);
  const clan = guild(data);
  return `╭━━━〔 🔥 *${title}* 〕━━━╮
┃ 👤 Name: *${field(player.nickname)}*
┃ 🆔 UID: ${field(player.accountId || player.uid)}
┃ 🌍 Region: ${field(player.region)}
┃ 🎚️ Level: ${field(player.level)}
┃ ❤️ Likes: ${field(player.liked)}
┃ 🏆 BR Points: ${field(player.rankingPoints)}
┃ ⚔️ CS Points: ${field(player.csRankingPoints)}
┃ 🛡️ Guild: ${field(clan.clanName || clan.guildName, 'No guild')}
╰━━━━━━━━━━━━━━━━━━━━╯`;
}


async function health() {
  const checks = [
    ['info', INFO_ENDPOINTS[0], () => fetchInfo('123456789', 'ind')],
    ['ban', BAN_ENDPOINTS[0], () => fetchBan('123456789')],
    ['search', SEARCH_ENDPOINTS[0], () => searchPlayers('test', 'IND')],
  ];
  const results = [];
  for (const [name, endpoint, fn] of checks) {
    const started = Date.now();
    try {
      await fn();
      results.push({ ok: true, status: name, ms: Date.now() - started, endpoint });
    } catch (error) {
      results.push({ ok: false, status: `${name}: ${error.message}`, ms: Date.now() - started, endpoint });
    }
  }
  return results;
}

async function fetchItems() {
  const { data } = await axios.get(ITEM_SOURCE, { timeout: HTTP_TIMEOUT });
  return Array.isArray(data) ? data : Object.values(data || {});
}

module.exports = { validateUid, fetchInfo, fetchBan, searchPlayers, fetchItems, basic, guild, skill, field, profileText, health };