# WhatsApp Secret Tricks, Styles & Designs — 100+ Q&A 💬🔥

Har sawal ka tafseeli jawab. Code wale sawalon ke liye `wa-tricks/` folder
mein alag `.cjs` files hain — har file detail mein, separate.

> **Note:** Kuch features (native flow buttons, carousel, spoiler) har
> WhatsApp client par same nahi dikhte. Classic buttons/list sab se reliable hain.

---

## A. Text Styles & Formatting ✍️

### 1. Bold text kaise likhein?
Dono taraf `*` lagao: `*Hello*` → **Hello**. Bot se: `` await sock.sendMessage(from, { text: "*Hello*" }) ``.

### 2. Italic kaise likhein?
Dono taraf `_`: `_Hello_` → *Hello*.

### 3. Strikethrough (kata hua) kaise?
Dono taraf `~`: `~Hello~` → ~Hello~.

### 4. Native code block kaise banayein?
Triple backticks ko language ke saath bhejo: ` ```javascript ... ``` `. MYBOT ka native-code plugin isay supported runtime par WhatsApp ke Rich Response code card mein convert karta hai — language label, syntax highlighting, copy action aur long-code scrolling client render karta hai. Command: `-code javascript ...`.

### 5. Inline code (line ke andar)?
Single backtick: `` `const x=1` `` → halka background, ek line mein.

### 6. Quote block (screenshot wala) kaise?
Har line ke shuru mein `> `: `> ye quote hai` → left side par vertical bar. Detail: `wa-trick-formatting.cjs`.

### 7. Bullet list kaise banayein?
Har line `- ` se shuru karo:
```
- Ek
- Do
```

### 8. Numbered list?
`1. `, `2. ` se shuru karo — WhatsApp khud number karta hai.

### 9. Spoiler (tap-to-reveal) text?
**Stable WhatsApp mein abhi nahi hai** (Oct 2026) — sirf beta mein `||text||`. DIY tareeqa: `tap-reveal.cjs` (button dabao → secret khule).

### 10. Bold + Italic ek saath?
Combine karo: `*_Hello_*` → ***Hello***. Strikethrough ke saath bhi: `*~Hello~*`.

### 11. Code ko normal text se alag kaise dikhayein?
Fenced code blocks ` ```javascript ... ``` ` use karo. MYBOT ka `native-code-block.cjs` supported Rich Response renderer ko prefer karta hai; agar native support na ho to safe triple-backtick text fallback deta hai. `code-design.cjs` image renderer hai aur automatic native code formatting ke liye use nahi hota.

### 12. Bara stylish/ASCII art text?
Monospace block mein ASCII art bhejo — font fix rehta hai. Ya `media` se image banao.

### 13. Link clickable preview ke saath?
Plain URL bhejo — WhatsApp khud preview banata hai: `https://example.com`. Preview hatana ho to URL ke aage `<` lagao.

### 14. "Read more..." wala lamba message trick?
~4000 characters ke baad WhatsApp khud "Read more" lagata hai. Koi official chhota-text trick nahi — lamba message hi bhejo.

### 15. Emoji text mein?
Direct unicode emoji likho — sab clients par dikhte hain. Windows par `Win + .` se picker.

### 16. Text ko RANG (color) de sakte hain?
Normal WhatsApp text mein arbitrary text colors bot control nahi karta. Native code cards mein syntax highlighting WhatsApp ke Rich Response renderer se aati hai; ye normal message text coloring se alag feature hai.

---

## B. Clickable Buttons 🔘

### 17. Clickable button kaise banayein?
Classic reply buttons — sab se reliable:
```javascript
await sock.sendMessage(from, {
    text: "Ek chuno:",
    footer: "My Bot",
    buttons: [
        { buttonId: "btn_help", buttonText: { displayText: "🆘 Help" }, type: 1 },
        { buttonId: "btn_menu", buttonText: { displayText: "📋 Menu" }, type: 1 },
    ],
    headerType: 1,
});
```
Detail: `wa-trick-buttons.cjs`.

### 18. Ek message mein kitne buttons?
Reply buttons **max 3**. Zyada chahiye to List message (Q31) use karo.

### 19. Website kholne wala button?
CTA URL button (native flow):
```javascript
{ name: "cta_url", buttonParamsJson: JSON.stringify({
    display_text: "🌐 Visit", url: "https://example.com" }) }
```

### 20. Call karne wala button?
```javascript
{ name: "cta_call", buttonParamsJson: JSON.stringify({
    display_text: "📞 Call", phone_number: "+923001234567" }) }
```

### 21. Copy-code button (coupon jaisa)?
```javascript
{ name: "cta_copy", buttonParamsJson: JSON.stringify({
    display_text: "📋 Copy Code", copy_code: "SAVE20" }) }
```
Tap karte hi code clipboard mein!

### 22. Button dabane par bot ko kaise pata chalega?
```javascript
const id = msg.message?.buttonsResponseMessage?.selectedButtonId;
if (id === "btn_help") { /* ... */ }
```
Detail handler: `wa-trick-buttons.cjs` → `handleButtonTap()`.

### 23. Button ke saath image header?
Native flow mein `header: { title, hasMediaAttachment: true, imageMessage }`. Classic mein thumbnail limited hai.

### 24. Button ka rang/style badal sakte hain?
**Nahi** — WhatsApp ka fixed style hai. Text + emoji se style karo.

### 25. Reply button vs URL button mein farq?
Reply button bot ko wapis ID bhejta hai (bot action le). URL button browser kholta hai. Dono ek saath bhi lag sakte hain (native flow).

### 26. Kya buttons har phone par dikhte hain?
Classic buttons (`buttonsMessage`) — **haan, har client par**. Native flow buttons kuch purane clients par nahi dikhte. Reliable chahiye to classic.

### 27. Button ki expiry hoti hai?
Button message hamesha dikhta hai, lekin tap ka response foran handle karo. Purane button par tap bhi kaam karta hai (ID wapis aata hai).

### 28. Quick reply kya hota hai?
Wo button jo dabate hi uska `id` bot ko bhej de — sawal-jawab flow ke liye. `quick_reply` native flow mein.

### 29. Button text ki limit?
Display text ~20 characters tak behtar. Lamba text kat sakta hai.

### 30. Button dabane par "typing..." dikha sakte hain?
Haan — response se pehle `await sock.sendPresenceUpdate("composing", from)` karo. (Q107)

---

## C. Slider Menu / List 📋

### 31. Slider menu (list) kaise banayein?
List message neeche se slide ho kar khulta hai:
```javascript
await sock.sendMessage(from, {
    text: "Category chuno:",
    footer: "My Bot",
    title: "📋 Main Menu",
    buttonText: "Open Menu",
    sections: [{
        title: "Tools",
        rows: [
            { title: "Sticker", description: "Sticker banao", rowId: "cmd_sticker" },
            { title: "Time", description: "World time", rowId: "cmd_time" },
        ],
    }],
});
```
Detail: `wa-trick-listmenu.cjs`.

### 32. List mein sections kaise?
`sections` array mein multiple `{ title, rows }` objects. Har section ka heading dikhta hai.

### 33. Har section mein kitne rows?
~10 rows per section behtar; total bhi 10 tak rakho taake UI saaf rahe.

### 34. Row select par bot ko kya milta hai?
```javascript
const id = msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId;
```
(Kuch forks mein `rowId` ki jagah `id` — apni Baileys check karo.)

### 35. "Open Menu" button ka text badal sakte hain?
Haan — `buttonText` field se: `"Dekho 👀"`, `"Chuno 👇"` kuch bhi.

### 36. List ka title aur description?
`title` (menu ka naam), `text` (body), `footer` (neeche halka text) — teeno alag fields.

### 37. Sub-menu (nested menu) kaise?
Row tap par **dosri list** bhejo. Har list mein "🔙 Back" row rakho jo parent menu khole.

### 38. List rows mein images?
Classic list mein **nahi**. Images chahiye to Carousel (Q43) use karo.

### 39. Buttons vs List — kab kya?
3 ya kam options → Buttons. Zyada options/categories → List menu.

### 40. List selection ko command se kaise jorein?
`rowId` ko command jaisa rakho: `rowId: "-sticker"`. Tap par wahi text handler mein aayega — existing command chal jayega!

### 41. Kya list har client par dikhti hai?
Classic `listMessage` — haan, sab par reliable hai.

### 42. Menu mein Back button?
Aakhri row: `{ title: "🔙 Back", description: "Pichla menu", rowId: "menu_back" }` → parent list dobara bhejo.

---

## D. Carousel / Swipe Cards 🎠

### 43. Swipeable carousel cards kaise banayein?
`interactiveMessage` + `carouselMessage` — har card: image header + text + buttons. Code: `wa-trick-carousel.cjs`.

### 44. Har card mein kya-kya hota hai?
`header` (image/video), `body` (text), `footer` (halka text), `nativeFlowMessage.buttons` (card ke button).

### 45. Card par alag button?
Haan — har card ke apne buttons: `cta_url` (kharido), `quick_reply` (select). Misal: product cards.

### 46. Kitne cards ek carousel mein?
~10 tak. Zyada cards = slow load.

### 47. Carousel na dikhe to kya karein?
Client/Baileys version issue. `relayMessage` success lekin card na dikhe to classic buttons/list par wapis jao — wo guaranteed hain.

### 48. Product catalog carousel example?
`wa-trick-carousel.cjs` mein ready: image + naam + price + "Buy" button per card.

---

## E. Entry Forms / Data Entry 📝

### 49. WhatsApp mein entry form kaise banayein?
**2 tareeqe:** (1) Native **WhatsApp Flows** (Meta ka form builder) — business setup chahiye. (2) **Chat form** — bot ek-ek karke sawal poochhe. Code dono ke liye: `wa-trick-form.cjs`.

### 50. WhatsApp Flow kya hota hai?
Meta ka native in-chat form — WhatsApp ke andar hi screens khulti hain (naam, phone, address fields). Browser nahi khulta.

### 51. Flow ke liye kya-kya chahiye?
Meta Business account + Flows Manager mein published Flow + Flow ID + Flow token. Bina iske native Flow **nahi** bhej sakte.

### 52. Baileys se Flow bhej sakte hain?
Kuch forks mein: `await sock.sendWhatsAppFlow(jid, { flowId, flowToken, cta: "Form kholo", text: "..." })`. Plain Baileys/number par Flow ID ke bina kaam nahi karega.

### 53. Bina business setup ke form?
**Chat form** — behtareen alternative, foran kaam karta hai:
```javascript
// -form likho:
Bot: 📝 Apna naam likho:
You: Ali
Bot: 📱 Phone number:
You: 03001234567
Bot: 🏙️ City:
You: Lahore
Bot: ✅ Done! Naam: Ali, Phone: 03001234567, City: Lahore
```
Code: `wa-trick-form.cjs` → `startForm()` / `handleFormMessage()`.

### 54. Form mein validation kaise?
Har step par `validate` function: ghalat jawab par error + dobara sawal. Misal: phone regex `/^\+?\d{10,15}$/`.

### 55. Form beech mein cancel?
User `cancel` likhe to session khatam + confirm message. Har form mein zaroor rakho.

### 56. Form ka data save kahan hota hai?
`form-submissions.jsonl` file mein (ya apni DB). Har complete form ek line.

### 57. Multi-page/lamba form?
`FORM_STEPS` array mein jitne steps chaho — bot khud next/previous sambhalta hai.

### 58. Order form ka example?
Steps: naam → phone → address → item → quantity → confirm (haan/na). Aakhir mein order summary + "✅ Order mil gaya!"

### 59. Adhura form (timeout)?
5 min koi jawab na aaye to session auto-expire + "⏰ Form expire ho gaya, dobara `-form` likho".

### 60. Flow ka data kahan jata hai?
Flow Data Exchange webhook/endpoint par — apna server lagana parta hai. Chat form ka data seedha tumhare paas.

---

## F. Media Tricks 📸

### 61. View-once photo kaise bhejein?
```javascript
await sock.sendMessage(from, {
    image: { url: "https://..." }, caption: "Ek bar dekho 👀", viewOnce: true,
});
```
Detail: `wa-trick-media.cjs`.

### 62. View-once TEXT bhej sakte hain?
Nayi forks mein: `await sock.sendMessage(from, { text: "secret", viewOnce: true })`. Purani Baileys mein sirf media.

### 63. Kya view-once ka screenshot ruk sakta hai?
**Nahi** — screenshot/screen-record se bachne ka koi tareeqa nahi. Sensitive cheez view-once par bhi soch kar bhejo.

### 64. GIF kaise bhejein?
```javascript
await sock.sendMessage(from, {
    video: { url: "anim.gif" }, gifPlayback: true, caption: "🎠",
});
```
`gifPlayback: true` hi GIF banata hai!

### 65. Sticker kaise banayein/bhejein?
Image → **webp** convert (ffmpeg) → bhejo:
```bash
ffmpeg -i photo.jpg -vf "scale=512:512" sticker.webp
```
Code: `wa-trick-media.cjs` → `sendStickerFromImage()`.

### 66. Animated sticker?
Animated webp banao (ffmpeg se GIF→webp) — wahi sticker flow.

### 67. Voice note (mic wala) kaise?
```javascript
await sock.sendMessage(from, {
    audio: { url: "voice.mp3" }, mimetype: "audio/mp4", ptt: true,
});
```
`ptt: true` = push-to-talk style voice note. 🎤

### 68. Gol video note (video message)?
`ptv: true` flag kuch forks mein — support limited hai, pehle test karo.

### 69. HD photo kaise bhejein?
High-resolution image normal tareeqe se bhejo — WhatsApp quality rakhta hai. Koi special "HD flag" bot API mein standard nahi.

### 70. PDF/document kaise bhejein?
```javascript
await sock.sendMessage(from, {
    document: { url: "file.pdf" }, mimetype: "application/pdf",
    fileName: "Form.pdf",
});
```

### 71. Photo/video par caption?
`caption` field — media ke saath text. Formatting (bold waghera) caption mein bhi chalti hai!

### 72. Ek saath multiple photos (album)?
Piche-peeche bhejo — WhatsApp khud album group karta hai. Beech mein delay na rakho.

### 73. Media ke saath clickable button?
Interactive message mein `header` mein image + neeche buttons. Ya caption mein URL.

### 74. Audio ko gaana (music) ki tarah bhejein?
`ptt: true` hata do — normal audio player ban jayega.

### 75. Status/Story par post?
`status@broadcast` JID par bhejo: text/image/video status lag jata hai.

### 76. Contact card (vCard) kaise?
```javascript
await sock.sendMessage(from, {
    contacts: { displayName: "Ali", contacts: [{ vcard: "..." }] },
});
```
Stylish designs: `vcard-designs.cjs`, `quote-spoiler.cjs`.

---

## G. Polls, Reactions & Engagement 📊

### 77. Poll kaise banayein?
```javascript
await sock.sendMessage(from, {
    poll: { name: "Chai ya Coffee?", values: ["Chai ☕", "Coffee ☕"], selectableCount: 1 },
});
```
Code: `wa-trick-polls.cjs`.

### 78. Poll mein kitne options?
**2 se 12** tak.

### 79. Multi-select poll?
`selectableCount: 2` (ya zyada) — user multiple chun sakta hai.

### 80. Quiz (sahi/ghalat jawab wala)?
WhatsApp mein native quiz nahi. **Bot khud judge kare:** poll bhejo + sahi jawab save rakho + vote par "✅ Sahi!" / "❌ Ghalat!".

### 81. Poll ke votes kaise dekhein?
Apne banaye poll par `pollUpdateMessage` aata hai. **Dusron ke poll ke vote parhna reliable nahi.**

### 82. Kisi message par reaction (👍) kaise dein?
```javascript
await sock.sendMessage(from, { react: { text: "👍", key: msg.key } });
```

### 83. Message delete (sab ke liye)?
```javascript
await sock.sendMessage(from, { delete: msg.key });
```
Apne bheje message par kaam karta hai.

### 84. Bheja hua message edit?
```javascript
await sock.sendMessage(from, { edit: msg.key, text: "Naya text ✏️" });
```

---

## H. Group Tricks 👥

### 85. Sab members ko mention kaise karein?
```javascript
await sock.sendMessage(groupJid, {
    text: "Sab hazir! @...",
    mentions: participantJids, // ["123@s.whatsapp.net", ...]
});
```
**Zimmedari se use karo** — spam flag lag sakta hai. Code: `wa-trick-group.cjs`.

### 86. Welcome/Goodbye message?
`group-participants.update` event par pakdo:
```javascript
sock.ev.on("group-participants.update", async ({ id, participants, action }) => {
    if (action === "add") await sock.sendMessage(id, { text: `Welcome @${...}! 🎉`, mentions: participants });
    if (action === "remove") await sock.sendMessage(id, { text: "Allah hafiz! 👋" });
});
```

### 87. Anti-link (link bhejne par action)?
```javascript
if (/https?:\/\/|www\.|t\.me\//i.test(text)) {
    await sock.sendMessage(from, { delete: msg.key }); // delete
    await sock.sendMessage(from, { text: "⚠️ Link mana hai!" });
}
```
Admins ko exempt rakho.

### 88. Group ka invite link kaise nikalein?
```javascript
const code = await sock.groupInviteCode(groupJid);
const link = `https://chat.whatsapp.com/${code}`;
```

### 89. Kisi ko admin kaise banayein?
```javascript
await sock.groupParticipantsUpdate(groupJid, ["123@s.whatsapp.net"], "promote");
```
`"demote"` se admin wapis.

### 90. Sirf admin message bhejein (group lock)?
```javascript
await sock.groupSettingUpdate(groupJid, "announcement"); // sirf admin
await sock.groupSettingUpdate(groupJid, "not_announcement"); // sab
```

### 91. Group description change?
```javascript
await sock.groupUpdateDescription(groupJid, "Nayi description 📝");
```

### 92. Group mein poll?
Bilkul — wahi `poll` payload, group JID par bhejo.

### 93. Group mein buttons/list chalte hain?
Haan — DMs ki tarah group mein bhi render hote hain.

### 94. Spam/flood se kaise bachein?
Har send ke beech **1.5–2 sec delay**, ek waqt mein zyada groups mein broadcast nahi, aur mention-all roz-roz nahi.

---

## I. Privacy & Security 🔐

### 95. Disappearing messages?
Chat setting hai — bot se force nahi hota. View-once (Q61) qareebi alternative.

### 96. 2-step verification?
WhatsApp Settings → Account → Two-step verification — **zaroor ON rakho** bot number par bhi.

### 97. Kisi ko block kaise karein (bot se)?
```javascript
await sock.updateBlockStatus(jid, "block"); // "unblock" se kholo
```

### 98. Last seen / online hide?
Account privacy settings se — bot API se reliable control nahi.

### 99. Kya messages encrypted hain?
Haan — WhatsApp **end-to-end encrypted** hai by default, bot messages bhi.

### 100. Session backup?
`auth_state` folder ka backup rakho — warna dobara QR scan karna parega. Kisi se share **kabhi nahi**.

---

## J. Bot Automation 🤖

### 101. Auto-reply kaise lagayein?
```javascript
sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    const text = msg.message?.conversation || "";
    if (text === "salam") await sock.sendMessage(msg.key.remoteJid, { text: "Walaikum salam! 🤝" });
});
```

### 102. Keyword trigger?
Text match karo: `if (text.startsWith("-"))` → command; warna keyword list check.

### 103. AI chatbot jorein?
User ka text → AI API (jaise Muse) → jawab bhejo. Rate-limit + context sambhalna.

### 104. Button/list tap ka handler?
Ek central router: `wa-trick-main.cjs` — button ID, list rowId, poll vote sab ek jagah.

### 105. Broadcast (sab ko message)?
```javascript
for (const jid of jids) {
    await sock.sendMessage(jid, content);
    await new Promise(r => setTimeout(r, 1500)); // delay zaroori!
}
```
Code: `wa-trick-broadcast.cjs`. **Spam nahi — ban lag sakta hai.**

### 106. Scheduled message (roz subah 9 baje)?
```javascript
// simple: wa-trick-broadcast.cjs → scheduleDaily(sock, jid, content, 9, 0)
// ya npm i node-cron (persistent ke liye)
```

### 107. "Typing..." indicator?
```javascript
await sock.sendPresenceUpdate("composing", from);
// bhejne ke baad:
await sock.sendPresenceUpdate("paused", from);
```

### 108. Online dikhna?
`await sock.sendPresenceUpdate("available", from)` — lekin bot ko 24/7 online dikhane ki zaroorat nahi.

### 109. Session save kaise hota hai?
`useMultiFileAuthState("./auth")` — creds files mein. `creds.update` par save.

### 110. Disconnect par auto-reconnect?
```javascript
sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401)
        connect(); // dobara joro (401 = logout, QR dobara)
});
```

### 111. Ek bot, multiple devices?
Baileys **multi-device** hai — ek session, phone + bot saath. Ek number = ek bot session.

### 112. Ban se kaise bachein? 🛡️
- Bulk broadcast mein delay (1.5s+)
- Anjan numbers ko pehla message spam jaisa na ho
- Mention-all ka ghalat istemal nahi
- Unofficial bot hamesha risk par — important number par na chalao

---

## 📦 Code Files Index

| File | Kaam |
|---|---|
| `wa-trick-buttons.cjs` | Reply buttons + CTA (URL/Call/Copy) + tap handler |
| `wa-trick-listmenu.cjs` | Slider menu (list) + select handler |
| `wa-trick-formatting.cjs` | 8 text styles + demo |
| `wa-trick-carousel.cjs` | Swipeable product cards |
| `wa-trick-form.cjs` | Entry form (chat steps + Flow guide) |
| `wa-trick-polls.cjs` | Poll + quiz + vote judge |
| `wa-trick-media.cjs` | View-once, GIF, sticker, voice note, document |
| `wa-trick-contact-location.cjs` | vCard, location |
| `wa-trick-group.cjs` | Mention-all, welcome, anti-link, invite |
| `wa-trick-broadcast.cjs` | Broadcast + scheduler |
| `wa-trick-main.cjs` | Sab ka central router (wiring example) |
| `README.md` | Setup + version notes |

**Total: 112 Q&A** ✅
