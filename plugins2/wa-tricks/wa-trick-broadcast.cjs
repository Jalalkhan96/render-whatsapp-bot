/**
 * wa-trick-broadcast.cjs — Broadcast & scheduled messages 📣⏰
 * ==============================================================
 * CommonJS only. Prefix used in examples: `-`
 *
 *   - broadcast(sock, jids, content, {delayMs})
 *   - scheduleDaily(sock, jid, content, hour, minute)
 *
 * BAN RISK — ghor se parho:
 *   Tez/heavy broadcast (bina delay, anjaan numbers par) WhatsApp ki
 *   spam detection trigger kar sakta hai aur number BAN ho sakta hai.
 *   Hamesha delay rakho (kam az kam 1-2 second), sirf opted-in/logon
 *   ko bhejo, aur ek waqt mein zyada mat bhejo. Ye zimmedari tumhari hai.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ek content kayi jids ko bhejo.
 * Har jid par try/catch, har send ke baad delay.
 * Returns: { sent, failed: [{jid, error}] }
 */
async function broadcast(sock, jids, content, { delayMs = 1500 } = {}) {
    if (!Array.isArray(jids) || jids.length === 0) {
        throw new Error("wa-trick-broadcast: jids array zaroori hai");
    }
    let sent = 0;
    const failed = [];
    for (const jid of jids) {
        try {
            await sock.sendMessage(jid, content);
            sent++;
        } catch (e) {
            failed.push({ jid, error: e.message });
        }
        await sleep(delayMs);
    }
    return { sent, failed };
}

/** Agli hour:minute (24h clock) tak kitne ms hain? */
function msUntilNext(hour, minute) {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1); // aaj guzar gaya -> kal
    return next - now;
}

/**
 * Rozana ek muqarrar waqt par message bhejo.
 * setTimeout (pehli dafa) + setInterval (har 24h) par mabni hai.
 * Returns: { cancel() } — timer rokne ke liye.
 *
 * NOTE — persistence:
 *   Bot restart hone par ye timers khatam ho jate hain. Mustaqil
 *   scheduling ke liye `node-cron` package ya system cron istemal karo
 *   aur schedule ko file/DB mein save karo. Ye helper simple cases
 *   (bot chalta rahe) ke liye hai.
 */
function scheduleDaily(sock, jid, content, hour, minute) {
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        throw new Error("wa-trick-broadcast: hour 0-23, minute 0-59 mein do");
    }
    let intervalId = null;
    const fire = async () => {
        try {
            await sock.sendMessage(jid, content);
        } catch (e) {
            console.error("wa-trick-broadcast scheduleDaily:", e.message);
        }
    };
    const timeoutId = setTimeout(() => {
        fire();
        intervalId = setInterval(fire, 24 * 60 * 60 * 1000);
    }, msUntilNext(hour, minute));

    return {
        cancel() {
            clearTimeout(timeoutId);
            if (intervalId) clearInterval(intervalId);
        },
    };
}

module.exports = { broadcast, scheduleDaily, msUntilNext };

/* ================= MOCK DEMO TEST ================= */
if (require.main === module) {
    (async () => {
        const sent = [];
        const sock = {
            sendMessage: async (jid, content) => {
                if (jid === "bad@s.whatsapp.net") throw new Error("blocked");
                sent.push({ jid, content });
                return { ok: true };
            },
        };
        const assert = (cond, name) => console.log(cond ? `✅ ${name}` : `❌ FAIL: ${name}`);

        // broadcast — chhota delay taake test tez ho
        const t0 = Date.now();
        const res = await broadcast(
            sock,
            ["a@s.whatsapp.net", "bad@s.whatsapp.net", "c@s.whatsapp.net"],
            { text: "📣 Salam sab ko!" },
            { delayMs: 5 }
        );
        const took = Date.now() - t0;
        assert(res.sent === 2, "broadcast sent=2");
        assert(res.failed.length === 1 && res.failed[0].jid === "bad@s.whatsapp.net", "broadcast failed=1 (per-jid catch)");
        assert(took >= 10, `delay kaam kiya (${took}ms >= 10ms)`);

        // khali jids -> error
        try {
            await broadcast(sock, [], { text: "x" });
            assert(false, "khali jids par error aana chahiye tha");
        } catch (e) {
            assert(e.message.includes("jids array"), "empty jids error");
        }

        // msUntilNext — mustaqbil ka waqt
        const now = new Date();
        const ms = msUntilNext((now.getHours() + 2) % 24, now.getMinutes());
        assert(ms > 0 && ms <= 24 * 60 * 60 * 1000, `msUntilNext range mein (${Math.round(ms / 1000)}s)`);

        // scheduleDaily — cancel foran (timer leak nahi)
        const job = scheduleDaily(sock, "a@s.whatsapp.net", { text: "good morning" }, 8, 0);
        assert(typeof job.cancel === "function", "scheduleDaily cancel handle");
        job.cancel();

        // ghalat time -> error
        try {
            scheduleDaily(sock, "a@s.whatsapp.net", { text: "x" }, 25, 0);
            assert(false, "ghalat hour par error aana chahiye tha");
        } catch (e) {
            assert(e.message.includes("hour 0-23"), "bad hour error");
        }

        console.log(`\nTotal sends captured: ${sent.length}`);
    })().catch((e) => { console.error("❌", e); process.exit(1); });
}
