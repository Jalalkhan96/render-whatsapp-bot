# Cricbuzz Update Prototype

This folder contains the Cricbuzz data layer. It is safe to inspect locally
and is now used by the optional cricket commands in `plugins2/cricbuzz.js`;
the existing menu/dispatcher architecture remains unchanged.

## Run once

From the repository root:

```powershell
node .\cricbussupdate\index.js
```

The latest verified items are written to:

```text
cricbussupdate/data/latest.json
```

The tracker state is written to:

```text
cricbussupdate/data/trackers.json
```

## Run continuously

```powershell
$env:CRICBUZZ_INTERVAL_MS = "300000"
node .\cricbussupdate\index.js --watch
```

The watcher only reports new item IDs. It uses a five-minute default interval,
keeps a small local cache, sends a descriptive user agent, and does not
download media or bypass site protections.

## Bot commands

The bot plugin exposes:

```text
-cricketonlymenu
-cricketnews
-cricketlive
-cricketball <match id or link>
-crickettrack <match id or link>
-crickettrack list
-crickettrack stop <match id or link>
-cricketvideo [search words]
-cricketimage [search words]
```

`-crickettrack` polls one match and sends changed commentary, including over
and ball updates when the public page provides them. Public pages can return
HTTP 403; in that case the bot reports that data is temporarily unavailable
instead of inventing a score or bypassing access controls. Replies do not
include a source label.

`-cricketvideo Mohammad Amir` and `-cricketimage Mohammad Amir` show up to five
matching cards with download buttons. The selected file is downloaded only
when the user presses a card button; media size is capped and unavailable
media is reported instead of silently sending a broken file.

If the host receives Cricbuzz HTTP 403 responses, configure the cookie header
as a deployment secret only:

```dotenv
CRICBUZZ_COOKIE=name=value; other=value
```

Image downloads use the verified thumbnail directly. Video downloads require
a real public video stream on the detail page; HTML error pages are rejected.

This prototype currently collects public headline links from Cricbuzz home and
the latest-news page. WhatsApp delivery can be added later as a separate
adapter after the scraper output is reviewed.
