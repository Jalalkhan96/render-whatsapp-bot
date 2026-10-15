# wa-tricks/ — WhatsApp Secret Tricks Library 💬🔥

Baileys bot ke liye tricks library. CommonJS (`.cjs`) helpers ke saath MYBOT ka native code-block bridge bhi included hai.
Command prefix har jagah: **`-`**

---

## 📁 Files Index

| # | File | Kya karta hai |
|---|------|---------------|
| 1 | `WHATSAPP-100-TRICKS.md` | **100+ Q&A** — WhatsApp secret tricks, styles & designs. Har sawal ka tafseeli jawab; code wale sawalon ke liye neeche wali `.cjs` files. |
| 2 | `wa-trick-media.cjs` | Media tricks: view-once text/image, GIF, voice note (ptt), image→sticker (ffmpeg webp), document, "HD" image. |
| 3 | `wa-trick-contact-location.cjs` | vCard builder (`waid=`), contact card bhejo, static location pin. Live-location = limited (note andar). |
| 4 | `wa-trick-group.cjs` | mentionAll (@everyone jaisa), welcome/goodbye handler, anti-link (`containsLink`), group invite link. |
| 5 | `wa-trick-broadcast.cjs` | Broadcast (delay + per-jid try/catch), `scheduleDaily` (rozana muqarrar waqt par message). |
| 6 | `wa-trick-main.cjs` | **Wiring example / router** — `createRouter(sock)` → `handleMessage(msg)`: button taps, list selects, native-flow, poll updates, `-menu` `-buttons` `-form` `-ping` `-help` commands. Sibling files se auto-wire, warna built-in fallback. |
| 7 | `wa-trick-buttons.cjs` | Clickable reply buttons (max 3) + CTA buttons (URL/call), tap routing (`getButtonTapId` / `handleButtonTap`). |
| 8 | `wa-trick-listmenu.cjs` | List menu / main menu (`sendMainMenu`), row select routing. |
| 9 | `wa-trick-form.cjs` | Entry forms: multi-step Q&A form (validation + cancel + file save) aur WhatsApp Flows CTA (Meta config chahiye — note andar). |
| 10 | `wa-trick-carousel.cjs` | Swipeable carousel cards (image header + buttons per card). |
| 11 | `wa-trick-polls.cjs` | Native polls + quiz mode, vote handling. |
| 12 | `wa-trick-formatting.cjs` | WhatsApp ke text styles (bold/italic/strike/mono/inline-code/quote/lists) + spoiler note. |
| 13 | `native-code-block.cjs` | Fenced code → native Rich Response code card; language aliases, mixed text/code, and safe fallback. |
| 14 | `../codeblock.js` | `-code`, `-codeblock`, `-codeview`, `-cb` command. |

Har `.cjs` file ke neeche **mock demo test** hai — `node <file>` chalao, baghair asli WhatsApp ke sab verify ho jata hai.

---

## ⚙️ Setup

```bash
npm install --no-audit --no-fund
# sticker/media conversion ke liye:
sudo apt install ffmpeg
# mustaqil scheduling ke liye (optional):
npm i node-cron
```

---

## ⚠️ Version Caveats (zaroor parho)

- **Classic buttons + lists** sab se reliable hain — har client par dikhte hain. Jab shak ho, yehi istemal karo.
- **Native flow / carousel / Rich Response code cards** har WhatsApp client aur har Baileys build par same render nahi hote. MYBOT pins a CommonJS-compatible Rich Response build; test on the actual phone/client after installation.
- **WhatsApp Flows (form.cjs ka `sendFlowCTA`)** ke liye **Meta Business account + WhatsApp Manager mein Flow JSON** configure karna zaroori hai — saada Baileys bot se bina is setup ke nahi chalega.
- **Spoiler `||text||`** stable WhatsApp par launch nahi hua (beta-only). Stable clients par pipes aise hi nazar aayenge.
- **View-once text** sirf newer/community forks mein; stable par verify karke istemal karo.
- **Broadcast**: tez spam = ban risk. Delay rakho, sirf opted-in logon ko bhejo.

---

## 🔌 Wiring Snippet (`messages.upsert`)

```javascript
const { createRouter } = require("./wa-trick-main.cjs");
const { welcomeHandler } = require("./wa-trick-group.cjs");
// const { handleTapReveal } = require("../tap-reveal.cjs"); // agar ho

const router = createRouter(sock); // prefix default "-"

sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    // if (await handleTapReveal(sock, msg)) return; // tap-reveal wiring
    await router.handleMessage(msg);
});

sock.ev.on("group-participants.update", welcomeHandler(sock));
```

---

## 🧪 Tests chalao

```bash
cd ~/workspace/your_files/wa-tricks
for f in wa-trick-*.cjs; do echo "== $f"; node --check "$f" && node "$f" > /dev/null && echo OK; done
```
