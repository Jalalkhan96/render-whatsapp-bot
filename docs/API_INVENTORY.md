# API Inventory (Configuration + Routing)

## Apify social/search

YouTube: `automation-lab/youtube-scraper`
TikTok: `clockworks/tiktok-scraper`
Instagram: `apify/instagram-search-scraper`
Facebook: `apify/facebook-search-scraper`
Reddit: `hipersoft/reddit-scraper`
Pinterest: `subimpact/pinterest-scraper`
X: `forge-api/x-scraper`
LinkedIn people: `harvestapi/linkedin-profile-search`
LinkedIn jobs: `bebity/linkedin-jobs-scraper`
LinkedIn posts: `apimaestro/linkedin-profile-posts`
Threads: `lergassy/threads-scraper`
Snapchat: `automation-lab/snapchat-scraper`

Token source: `APIFY_TOKEN_1` … `APIFY_TOKEN_n`

## Other configured providers

- Gemini / local Web2API
- Groq
- Telegram Bot API
- Cricket providers
- Pakistan data / weather / currency providers
- Existing media/download providers

All external providers must fail gracefully; no provider is considered live-healthy without an actual request.
