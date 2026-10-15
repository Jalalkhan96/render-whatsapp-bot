# Adult command removal

This update disables adult-content commands and source targets for all users, group admins, primary owners, and secondary owners.

- Central dispatch gates apply to WhatsApp, Telegram, and the alternate command router.
- Adult command aliases are omitted from registration and old names are explicitly rejected.
- Neko keeps safe categories only; NSFW mode cannot be enabled.
- PP menus retain WEBTOON and Tapas only; adult media search commands are removed.
- Direct scraper targets are restricted to four allowlisted anime/art destinations.
- The downloader API blocks adult source domains before fetching URLs.
- `scripts/remove-adult-features.sh` deletes dormant extractor packages and stale NSFW settings.

After replacing the files, run `bash scripts/remove-adult-features.sh` from the bot root and restart every bot process.
