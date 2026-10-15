'use strict';

/**
 * ABIX-AE — Approve all pending WhatsApp group join requests.
 *
 * Admin-only, group-only command. Uses Baileys' official group membership
 * approval methods:
 *   groupRequestParticipantsList(jid)
 *   groupRequestParticipantsUpdate(jid, jids, 'approve')
 *
 * The bot itself must also be a group admin because WhatsApp requires an
 * administrator account to approve membership requests.
 */

const BATCH_SIZE = Math.max(1, Math.min(50, Number(process.env.ACCEPTALL_BATCH_SIZE || 25)));

function unique(values) {
    return [...new Set(values.filter(Boolean).map(String))];
}

function requestJid(request) {
    return request?.jid || request?.id || request?.participant || request?.user || null;
}

async function approveBatch(sock, groupJid, jids) {
    const results = await sock.groupRequestParticipantsUpdate(
        groupJid,
        jids,
        'approve'
    );
    return Array.isArray(results) ? results : [];
}

module.exports = {
    command: 'acceptall',
    aliases: [
        'approveall',
        'acceptrequests',
        'approvejoin',
        'acceptpending',
        'approvepending'
    ],
    category: 'group',
    description: 'Approve all pending WhatsApp group join requests',
    usage: '-acceptall',
    permission: 'GROUP_ADMIN',
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    cooldown: 3,

    async handler(sock, message, args = [], context = {}) {
        const chatId = context.chatId || message?.key?.remoteJid;
        if (!chatId || !chatId.endsWith('@g.us')) {
            throw new Error('This command can only be used inside a group.');
        }

        if (typeof sock.groupRequestParticipantsList !== 'function' ||
            typeof sock.groupRequestParticipantsUpdate !== 'function') {
            throw new Error('This Baileys version does not expose WhatsApp join-request approval methods.');
        }

        const pending = await sock.groupRequestParticipantsList(chatId);
        const jids = unique((Array.isArray(pending) ? pending : []).map(requestJid));

        if (!jids.length) {
            return sock.sendMessage(chatId, {
                text: '✅ *Pending Requests*\n\nThere are no pending join requests in this group.'
            }, { quoted: message });
        }

        let approved = 0;
        let failed = 0;
        const failures = [];

        for (let i = 0; i < jids.length; i += BATCH_SIZE) {
            const batch = jids.slice(i, i + BATCH_SIZE);
            try {
                const results = await approveBatch(sock, chatId, batch);

                if (!results.length) {
                    // Some compatible Baileys wrappers return an empty array
                    // after a successful membership action. In that case the
                    // request call itself completed without throwing.
                    approved += batch.length;
                    continue;
                }

                const returned = new Set();
                for (const result of results) {
                    const jid = requestJid(result);
                    if (jid) returned.add(jid);
                    const status = String(result?.status ?? result?.error ?? '200');
                    const ok = status === '200' || status === '0' || !result?.error;
                    if (ok) {
                        approved += 1;
                    } else {
                        failed += 1;
                        failures.push(`${jid || 'unknown'} (${status})`);
                    }
                }

                // If a wrapper returns only part of the affected list, do not
                // falsely report those omitted entries as approved.
                if (results.length < batch.length) {
                    const missing = batch.filter((jid) => !returned.has(jid));
                    failed += missing.length;
                    for (const jid of missing.slice(0, 8)) {
                        failures.push(`${jid} (not returned by WhatsApp)`);
                    }
                }
            } catch (error) {
                failed += batch.length;
                failures.push(`${batch.length} request(s): ${String(error?.message || error)}`.slice(0, 300));
            }
        }

        const lines = [
            '╭━━━〔 ✅ JOIN REQUESTS 〕━━━╮',
            '┃',
            `┃ 📋 Pending found : ${jids.length}`,
            `┃ ✅ Approved      : ${approved}`,
            `┃ ❌ Failed        : ${failed}`,
            '┃',
            approved || !failed
                ? '┃ 🎉 Processing complete.'
                : '┃ ⚠️ Some requests could not be approved.',
            '┃',
            '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯'
        ];

        if (failures.length) {
            lines.push('', '⚠️ *Details:*', ...failures.slice(0, 8).map(v => `• ${v}`));
        }

        return sock.sendMessage(chatId, {
            text: lines.join('\n')
        }, { quoted: message });
    }
};
