# Telenor Quiz — Daily Cache Design

## Behavior

The `.telanswer` command is intentionally **lazy/cache-first**.

### First request of a Karachi day

1. The bot calculates today's date using `Asia/Karachi`.
2. It checks `data/telenorQuizAnswers.json`.
3. If the cache belongs to today, **no network request is made**.
4. If there is no cache (or yesterday's cache), the bot fetches the current quiz.
5. The response is validated to make sure it contains exactly 5 questions and the source date is today's Karachi date.
6. Only after validation is the result written atomically to the cache.

### Millions of requests

After the first successful fetch:

```text
.telanswer request #1  -> network -> save cache
.telanswer request #2  -> local cache
.telanswer request #3  -> local cache
.telanswer request #4  -> local cache
...
.telanswer request #1,000,000 -> local cache
```

If multiple users request `.telanswer` at exactly the same moment when the cache is empty, the bot uses a **single in-flight Promise lock**. They all wait for the same fetch instead of starting hundreds/thousands of duplicate HTTP requests.

## Midnight rollover

The authoritative timezone is:

```text
Asia/Karachi
PKT / UTC+05:00
```

At the Karachi calendar-day change, the old cache is deleted. The bot **does not pre-fetch** the new quiz at midnight. The next `.telanswer` request performs the first fetch for the new day.

This is deliberate: it avoids unnecessary traffic and means the bot only downloads the new quiz when someone actually requests it.

The cache is also checked on every request, so a process restart or timer delay cannot make yesterday's answers survive into a new Karachi day.

## Stale-source protection

A source response is rejected if its date is not today's Karachi date.

For example:

```text
Today:        2026-09-26
Source says:  2026-09-25
Result:       REJECTED — not cached
```

This prevents yesterday's answer page from being silently presented as today's answer.

## Sources

Primary API:

```text
https://telenorquiztodays.pk/api/telenor
```

HTML fallbacks:

```text
https://paklivings.pk/my-telenor-answer-today/
https://mytelenoranswertodays.pk/
https://www.abixxmakki.com/telenor
```

These are third-party sources and are not official Telenor APIs. The bot validates the source date before caching.

## Environment overrides

Optional:

```env
TELENOR_API_URL=https://telenorquiztodays.pk/api/telenor
TELENOR_HTML_SOURCE_URL=https://paklivings.pk/my-telenor-answer-today/
TELENOR_HTML_SOURCE_URL_2=https://mytelenoranswertodays.pk/
TELENOR_HTML_SOURCE_URL_3=https://www.abixxmakki.com/telenor
TELENOR_REQUEST_TIMEOUT_MS=20000
TELENOR_USER_AGENT=ABIX-AE Telenor Quiz Reader/3.0
```

Do not put a static quiz answer in `.env` or source code. The daily answer must come from the fetch/cache flow.

## Cache file

Runtime cache:

```text
data/telenorQuizAnswers.json
```

It is intentionally not shipped with a pre-filled daily answer. A new installation fetches the current quiz on the first `.telanswer` request.

## Command

```text
.telanswer
.telenoranswer
.telenoranswers
```
