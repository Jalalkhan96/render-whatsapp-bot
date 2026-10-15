# ABIX-AE Free Fire API on Railway

This folder is a standalone proxy service. It does not run the WhatsApp bot.
It forwards player info, ban, and search requests to upstream providers configured
through Railway variables, and exposes the public item catalogue route.

## Railway setup

1. Push this repository to GitHub.
2. In Railway, create a new service from the GitHub repository.
3. Set the service **Root Directory** to `/freefire-api`.
4. Railway will run `npm install` and `npm start`.
5. Generate a Railway public domain, for example:
   `https://your-service.up.railway.app`
6. Test:

```text
https://your-service.up.railway.app/freefire/health
https://your-service.up.railway.app/freefire/items
```

## Required Railway variables

```text
FF_PROXY_KEY=generate-a-long-random-secret
FF_UPSTREAM_INFO_API=https://provider.example/info?uid={uid}&region={region}&key={key}
FF_UPSTREAM_BAN_API=https://provider.example/ban?uid={uid}&key={key}
FF_UPSTREAM_SEARCH_API=https://provider.example/search?keyword={keyword}&server={server}&key={key}
FF_API_KEY=provider-key-if-required
FF_API_TIMEOUT_MS=8000
```

The upstream URLs are provider-specific. The proxy cannot create real player
data without a working upstream provider. Never put a provider secret in a
WhatsApp command or in Git.

## Migration from the old Discord bot

The old Discord cogs were not a separate database or hidden player source.
They all called these HTTP endpoints:

```text
http://raw.thug4ff.xyz/info
http://raw.thug4ff.xyz/generate
http://raw.thug4ff.xyz/leaderboard
http://profile.thug4ff.xyz/api/profile
```

The old `/info` endpoint currently returns HTTP 404, and the old code used the
hardcoded `key=great`. That key is not a valid guaranteed provider credential.
The previously documented `glob-info2.vercel.app/info` endpoint was also tested
and returned HTTP 402, so it must not be treated as a working default.

The old bot is still useful for:

- response field names such as `basicInfo`, `profileInfo`, `socialInfo`,
  `creditScoreInfo`, `clanBasicInfo`, `petInfo`, and `career`
- formatting ideas for `.ffinfo`, `.ffcareer`, `.ffguild`, and `.ffskills`
- local item data and profile-card code

It does not provide a working upstream API by itself. Configure a currently
working provider in Railway before enabling player-data routes.

## Bot variables

Set these in the bot service, not in this folder:

```text
FF_LOCAL_API=true
FF_LOCAL_API_URL=https://your-service.up.railway.app/freefire
FF_API_TIMEOUT_MS=8000
FF_API_KEY=generate-a-long-random-secret
```

`FF_API_KEY` in the bot must equal `FF_PROXY_KEY` in Railway. The bot sends it
as the `x-api-key` header. If the Railway proxy key is empty, routes remain
unprotected, which is not recommended for a public deployment.
