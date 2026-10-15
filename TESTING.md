# Smoke-test checklist

After placing the plugin files and configuring your own `.env`:

1. Start the bot and verify both plugins load exactly once with no import/alias errors.
2. Reply to a normal image using `-s`; the returned WebP should fit inside a 512×512 transparent canvas and be <=100 KB.
3. Reply to a GIF or short video using `-sticker`; the returned animated WebP should be <=500 KB and <=6 seconds.
4. Run `-tiktokprofile apifylife`; the result should contain the public profile name, username, verification flag, bio, follower/following/like/video counts and, where fetchable, profile picture.
5. For the card maker, start the local server and open `http://127.0.0.1:4173`. Fetch a public account and make sure the fetched profile photo still allows the PNG download button to work.

Live checks require a real Apify token and a working FFmpeg build. Do not paste your token into logs or share it in screenshots.
