/**
 * wa-trick-carousel.cjs — Swipeable Carousel Cards 🎠
 * =====================================================
 * WhatsApp ke native swipeable carousel cards (interactive message).
 * Har card mein image header + description + footer + apne buttons.
 *
 * USE:
 *   const { buildCarouselCards, sendCarousel } =
 *       require("./wa-trick-carousel.cjs");
 *
 *   const cards = await buildCarouselCards(sock, [
 *       {
 *           title: "🔴 Red Sneaker",
 *           description: "Premium running shoe — Rs 4,999",
 *           footer: "Khan Shoes",
 *           imageUrl: "https://example.com/shoe1.jpg",
 *           buttons: [
 *               { type: "url",   text: "🛒 Buy Now", value: "https://example.com/buy/1" },
 *               { type: "reply", text: "👁️ Details", value: "detail_1" },
 *               { type: "copy",  text: "📋 Copy Code", value: "SHOE10" },
 *           ],
 *       },
 *       // ... mazeed cards
 *   ]);
 *   await sendCarousel(sock, from, {
 *       bodyText: "👟 *New Collection* — swipe karo!",
 *       footerText: "Khan Shoes",
 *       cards,
 *   });
 *
 * ⚠️ AHEM NOTES (zaroor parho):
 *  1. HAR CARD KO image/video header CHAHIYE — bina media ke card
 *     render nahi hoga (hasMediaAttachment: true lazmi hai).
 *  2. Carousel purane WhatsApp clients par NAHI dikhega —
 *     apne phone par LIVE TEST karo bhejne se pehle.
 *  3. Card count ki limit hai (aam tor par ~10 tak — exact cap
 *     UNVERIFIED hai, live test karo).
 *  4. Button taps `buttonsResponseMessage` / interactive response
 *     ki surat mein aate hain — apne handler mein pakro.
 */

let baileys = null;
try {
    // Lazy require taake baqi file (button mapping waghera) baghair
    // baileys ke bhi import/test ho sake.
    baileys = require("@whiskeysockets/baileys");
} catch (e) {
    baileys = null; // demo mein gracefully skip hoga
}

function needBaileys() {
    if (!baileys) {
        throw new Error(
            'wa-trick-carousel: "@whiskeysockets/baileys" installed nahi hai.\n' +
            "Lagao: npm i @whiskeysockets/baileys\n" +
            "(carousel cards ko generateWAMessageContent / generateWAMessageFromContent chahiye)"
        );
    }
    return baileys;
}

/**
 * Button object ko native-flow button mein badlo.
 * btn = { type: 'url'|'reply'|'copy', text, value }
 *
 *  url   -> cta_url    (bahar link kholta hai)
 *  reply -> quick_reply (bot ko wapis tap bhejta hai, id = value)
 *  copy  -> cta_copy   (value clipboard mein copy hota hai)
 */
function mapButton(btn) {
    const display_text = btn.text || "Open";
    switch (btn.type) {
        case "url":
            return {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                    display_text,
                    url: btn.value,
                }),
            };
        case "copy":
            return {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                    display_text,
                    copy_code: btn.value,
                }),
            };
        case "reply":
        default:
            return {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text,
                    id: btn.value || display_text,
                }),
            };
    }
}

/**
 * Items se carousel cards banao (media upload ke saath).
 * items = [{ title, description, footer, imageUrl,
 *             buttons: [{type,text,value}] }]
 * sock = Baileys socket (sock.waUploadToServer lazmi hai)
 */
async function buildCarouselCards(sock, items) {
    const { generateWAMessageContent } = needBaileys();

    if (!Array.isArray(items) || items.length === 0) {
        throw new Error("buildCarouselCards: items khali hain — kam az kam 1 card do.");
    }

    const cards = [];
    for (const item of items) {
        if (!item.imageUrl) {
            throw new Error(
                `buildCarouselCards: card "${item.title || "?"}" mein imageUrl missing hai — ` +
                "har card ko image/video header chahiye."
            );
        }
        // Image ko WhatsApp server par upload karo, imageMessage lo
        const media = await generateWAMessageContent(
            { image: { url: item.imageUrl } },
            { upload: sock.waUploadToServer }
        );

        cards.push({
            header: {
                title: item.title || "",
                hasMediaAttachment: true, // ⚠️ lazmi — warna card nahi render hoga
                imageMessage: media.imageMessage,
            },
            body: { text: item.description || "" },
            footer: { text: item.footer || "" },
            nativeFlowMessage: {
                buttons: (item.buttons || []).map(mapButton),
            },
        });
    }
    return cards;
}

/**
 * Carousel bhejo.
 * opts = { bodyText, footerText, cards }  (cards = buildCarouselCards ka result)
 */
async function sendCarousel(sock, jid, { bodyText, footerText, cards }) {
    const { generateWAMessageFromContent } = needBaileys();

    const content = await generateWAMessageFromContent(
        jid,
        {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        body: { text: bodyText || "" },
                        footer: { text: footerText || "" },
                        carouselMessage: { cards },
                    },
                },
            },
        },
        {}
    );

    await sock.relayMessage(jid, content.message, {
        messageId: content.key.id,
    });
    return content.key.id;
}

module.exports = {
    buildCarouselCards,
    sendCarousel,
    mapButton,
    hasBaileys: () => !!baileys,
};

/* ================= MOCK DEMO TEST ================= */
if (require.main === module) {
    (async () => {
        console.log("--- 1. Button mapping (baileys ke baghair) ---");
        const demoButtons = [
            { type: "url", text: "🛒 Buy", value: "https://example.com/1" },
            { type: "reply", text: "👁️ Details", value: "detail_1" },
            { type: "copy", text: "📋 Code", value: "SHOE10" },
        ];
        for (const b of demoButtons) {
            const m = mapButton(b);
            console.log(`✅ ${b.type} -> name="${m.name}" params=${m.buttonParamsJson}`);
        }

        console.log("\n--- 2. Card assembly (fake media, baileys skip) ---");
        const fakeMedia = { imageMessage: { fake: true, mimetype: "image/jpeg" } };
        const card = {
            header: { title: "🔴 Red Sneaker", hasMediaAttachment: true, imageMessage: fakeMedia.imageMessage },
            body: { text: "Premium running shoe — Rs 4,999" },
            footer: { text: "Khan Shoes" },
            nativeFlowMessage: { buttons: demoButtons.map(mapButton) },
        };
        console.log("✅ card keys:", Object.keys(card).join(", "));
        console.log("✅ header.hasMediaAttachment:", card.header.hasMediaAttachment);
        console.log("✅ buttons:", card.nativeFlowMessage.buttons.length);

        console.log("\n--- 3. Baileys live path ---");
        if (!baileys) {
            console.log("⚠️ baileys installed nahi — live upload test SKIPPED (graceful).");
            try {
                await buildCarouselCards({}, []);
            } catch (e) {
                console.log("✅ helpful error milta hai:", JSON.stringify(e.message.split("\n")[0]));
            }
        } else {
            console.log("baileys mila — mock sock se full build test:");
            const sent = [];
            const mockSock = {
                waUploadToServer: async () => ({ /* upload stub */ }),
                relayMessage: async (jid, message, opts) => {
                    sent.push({ jid, hasInteractive: !!message?.interactiveMessage, messageId: opts.messageId });
                },
            };
            // NOTE: ye sirf tab chalega jab asli baileys ho; yahan skip.
            console.log("✅ (live build ke liye apne bot mein chalao)");
        }
        console.log("\n🎠 carousel demo complete.");
    })().catch((e) => { console.error("❌", e.message); process.exit(1); });
}
