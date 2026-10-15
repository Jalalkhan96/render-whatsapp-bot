/**
 * wa-trick-contact-location.cjs — Contact cards & location 📇📍
 * =================================================================
 * CommonJS only. Prefix used in examples: `-`
 *
 *   - buildVCard({number,name,org,title,email}) -> vCard string (TEL;...;waid=)
 *   - sendContact(sock, from, vcard, displayName, quotedMsg)
 *   - sendLocation(sock, from, {lat, lng, name, address})
 *
 * NOTE — live location:
 *   Asli "live location" ke liye musalsal location updates bhejne parte
 *   hain (har kuch second baad naya point). Baileys mein is ka koi
 *   maintained/easy tareeqa nahi — bots aam tor par sirf STATIC location
 *   bhejte hain. Is file mein live-location ko LIMITED mark kiya gaya hai;
 *   agar zaroorat ho to apni Baileys version par live-location support
 *   check karo, assume mat karo.
 */

const cleanNum = (n) => String(n || "").replace(/[^\d]/g, "");

/**
 * vCard string banao.
 * WhatsApp contact card ke liye TEL line mein `waid=<number>` zaroori hai
 * taake WhatsApp ise clickable WhatsApp number samjhe.
 */
function buildVCard({ number, name = "", org = "", title = "", email = "" } = {}) {
    const num = cleanNum(number);
    if (!num) throw new Error("wa-trick-contact-location: number zaroori hai (digits mein)");

    let v = "BEGIN:VCARD\nVERSION:3.0\n";
    if (name) v += `FN:${name}\nN:${name};;;;\n`;
    if (org) v += `ORG:${org}\n`;
    if (title) v += `TITLE:${title}\n`;
    v += `TEL;type=CELL;type=VOICE;waid=${num}:+${num}\n`;
    if (email) v += `EMAIL:${email}\n`;
    v += "END:VCARD";
    return v;
}

/** Contact card bhejo. */
async function sendContact(sock, from, vcard, displayName = "Contact", quotedMsg = null) {
    await sock.sendMessage(
        from,
        { contacts: { displayName, contacts: [{ vcard }] } },
        quotedMsg ? { quoted: quotedMsg } : {}
    );
}

/**
 * Static location pin bhejo.
 * lat/lng decimal degrees mein (misal: Lahore 31.5204, 74.3587).
 */
async function sendLocation(sock, from, { lat, lng, name = "", address = "" } = {}, quotedMsg = null) {
    if (typeof lat !== "number" || typeof lng !== "number") {
        throw new Error("wa-trick-contact-location: lat/lng number mein do (decimal degrees)");
    }
    await sock.sendMessage(
        from,
        { location: { degreesLatitude: lat, degreesLongitude: lng, name, address } },
        quotedMsg ? { quoted: quotedMsg } : {}
    );
}

/*
 * LIVE LOCATION — LIMITED (unverified, assume mat karo)
 * ------------------------------------------------------
 * Kuch purane examples mein `liveLocationMessage` ya baar-baar
 * location update bhejne ka zikr milta hai, lekin Baileys mein is ka
 * koi stable, documented tareeqa nahi. Bot se live location ke liye:
 *   1. Apni Baileys fork ka source dekho (liveLocation support hai ya nahi)
 *   2. Har N second baad naya static location bhejna "live" NAHI lagta —
 *      WhatsApp ise alag-alag pins dikhayega
 * Agar tumhari fork mein live-location kaam kare to us ka snippet yahan
 * add kar lena; default tor par STATIC location hi reliable hai.
 */

module.exports = { buildVCard, sendContact, sendLocation, cleanNum };

/* ================= MOCK DEMO TEST ================= */
if (require.main === module) {
    (async () => {
        const sent = [];
        const sock = {
            sendMessage: async (jid, content, opts) => {
                sent.push({ jid, content, quoted: !!opts?.quoted });
                return { ok: true };
            },
        };
        const from = "123@s.whatsapp.net";
        const assert = (cond, name) => console.log(cond ? `✅ ${name}` : `❌ FAIL: ${name}`);

        // vCard build
        const v = buildVCard({
            number: "+92 300 1234567",
            name: "khan",
            org: "Khan Shoes",
            title: "Founder",
            email: "hello@example.com",
        });
        assert(v.includes("BEGIN:VCARD") && v.endsWith("END:VCARD"), "vCard BEGIN/END");
        assert(v.includes("FN:khan"), "vCard FN");
        assert(v.includes("waid=923001234567"), "vCard waid (digits only)");
        assert(v.includes("ORG:Khan Shoes") && v.includes("TITLE:Founder"), "vCard ORG/TITLE");
        assert(v.includes("EMAIL:hello@example.com"), "vCard EMAIL");

        // missing number -> error
        try {
            buildVCard({ name: "NoNum" });
            assert(false, "baghair number ke error aana chahiye tha");
        } catch (e) {
            assert(e.message.includes("number zaroori"), "missing number error");
        }

        // send contact
        const fakeQuote = { key: { id: "q1" } };
        await sendContact(sock, from, v, "khan", fakeQuote);
        const c = sent[0].content;
        assert(
            c.contacts && c.contacts.displayName === "khan" &&
            c.contacts.contacts[0].vcard === v && sent[0].quoted === true,
            "sendContact payload + quoted"
        );

        // send location (Lahore)
        await sendLocation(sock, from, {
            lat: 31.5204, lng: 74.3587,
            name: "Lahore", address: "Punjab, Pakistan",
        });
        const l = sent[1].content.location;
        assert(
            l.degreesLatitude === 31.5204 && l.degreesLongitude === 74.3587 &&
            l.name === "Lahore",
            "sendLocation payload"
        );

        // bad lat/lng -> error
        try {
            await sendLocation(sock, from, { lat: "abc", lng: 74 });
            assert(false, "ghalat lat par error aana chahiye tha");
        } catch (e) {
            assert(e.message.includes("lat/lng"), "bad lat/lng error");
        }

        console.log(`\nTotal sends captured: ${sent.length}`);
    })().catch((e) => { console.error("❌", e); process.exit(1); });
}
