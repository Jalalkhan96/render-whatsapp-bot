const axios = require('axios');

const HTTP_TIMEOUT = Number(process.env.FF_API_TIMEOUT_MS) || 8000;
const LOCAL_API = process.env.FF_LOCAL_API === 'false'
  ? ''
  : (process.env.FF_LOCAL_API_URL || `http://127.0.0.1:${process.env.PORT || 5000}/freefire`);

const INFO_ENDPOINTS = [
  process.env.FF_INFO_API,
  process.env.FF_INFO_API_2,
  LOCAL_API ? `${LOCAL_API}/info?uid={uid}&region={region}` : '',
  'https://glob-info2.vercel.app/info',
  'https://free-ff-api-src-5plp.onrender.com/api/v1/account',
  'https://developers.freefirecommunity.com/api/v1/info'
].filter(Boolean);

const BAN_ENDPOINTS = [
  process.env.FF_BAN_API,
  LOCAL_API ? `${LOCAL_API}/ban?uid={uid}` : ''
].filter(Boolean);

const SEARCH_ENDPOINTS = [
  process.env.FF_SEARCH_API,
  LOCAL_API ? `${LOCAL_API}/search?keyword={keyword}&server={server}` : ''
].filter(Boolean);

const REMOTE_ITEM_SOURCE = 'https://raw.githubusercontent.com/iamaanahmad/FreeFireItems/main/data/ItemData.json';
const ITEM_SOURCE = LOCAL_API ? `${LOCAL_API}/items` : REMOTE_ITEM_SOURCE;

const VALID_KEY = process.env.FF_API_KEY;

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

function apiError(error, label) {
  const status = error.response?.status;
  if ([401, 403].includes(status)) return new Error(`${label} API key/access required (HTTP ${status}).`);
  if (status === 402) return new Error(`${label} API quota/payment required (HTTP 402).`);
  if (status === 404) return new Error(`${label} endpoint not found (HTTP 404).`);
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return new Error(`${label} API timeout.`);
  return error;
}

function endpointRequest(endpoint, uid, region, params = {}) {
  const values = {
    uid: encodeURIComponent(String(uid)),
    region: encodeURIComponent(String(region || 'ind').toLowerCase()),
    key: encodeURIComponent(VALID_KEY || ''),
    keyword: encodeURIComponent(String(params.keyword || '')),
    server: encodeURIComponent(String(params.server || region || 'IND').toUpperCase())
  };
  const hasTemplate = /\{(?:uid|region|key|keyword|server)\}/i.test(endpoint);
  const url = endpoint.replace(/\{(uid|region|key|keyword|server)\}/gi, (_, key) => values[key.toLowerCase()]);
  return { url, params: hasTemplate ? params : { ...params, uid, region } };
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
        if (VALID_KEY) params.key = VALID_KEY;
      }

      const request = endpointRequest(endpoint, cleanUid, safeRegion, params);
      const { data } = await axios.get(request.url, {
        params: request.params,
        timeout: HTTP_TIMEOUT,
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
      lastError = apiError(error, 'Free Fire info');
    }
  }

  throw lastError || new Error('No Free Fire info API configured.');
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
      const request = endpointRequest(endpoint, cleanUid, 'ind', { uid: cleanUid });
      const { data } = await axios.get(request.url, {
        params: request.params,
        timeout: HTTP_TIMEOUT,
        headers: commonHeaders()
      });
      if (data && typeof data === 'object' && !data.error) return data;
      lastError = new Error(data?.error?.message || data?.error || 'Ban check failed.');
    } catch (error) {
      lastError = apiError(error, 'Free Fire ban');
    }
  }
  throw lastError || new Error('No Free Fire ban API configured.');
}

async function searchPlayers(keyword, server) {
  const clean = String(keyword || '').trim();
  if (clean.length < 3) {
    throw new Error('Keyword must be at least 3 characters.');
  }

  let lastError;
  for (const endpoint of SEARCH_ENDPOINTS) {
    try {
      const request = endpointRequest(endpoint, '', server, {
        keyword: clean,
        server: String(server || 'IND').toUpperCase()
      });
      const { data } = await axios.get(request.url, {
        params: request.params,
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
      lastError = apiError(error, 'Free Fire search');
    }
  }
  throw lastError || new Error('No Free Fire search API configured. Set FF_SEARCH_API.');
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

async function fetchItems() {
  const { data } = await axios.get(ITEM_SOURCE, { timeout: HTTP_TIMEOUT });
  const payload = data?.success && data.data ? data.data : data;
  return Array.isArray(payload) ? payload : Object.values(payload || {});
}

async function health() {
  const endpoints = [...new Set([
    ...INFO_ENDPOINTS,
    ...BAN_ENDPOINTS,
    ...SEARCH_ENDPOINTS,
    ITEM_SOURCE
  ])];
  return Promise.all(endpoints.map(async endpoint => {
    const started = Date.now();
    try {
      const response = await axios.get(endpoint, {
        timeout: HTTP_TIMEOUT,
        headers: commonHeaders(),
        validateStatus: () => true
      });
      return { endpoint, status: response.status, ms: Date.now() - started, ok: response.status >= 200 && response.status < 300 };
    } catch (error) {
      return { endpoint, status: error.response?.status || error.code || 'ERR', ms: Date.now() - started, ok: false };
    }
  }));
}

module.exports = { validateUid, fetchInfo, fetchBan, searchPlayers, fetchItems, basic, guild, skill, field, profileText, health };