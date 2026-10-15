import {
    getDoc,
    setDoc,
    deleteDoc
} from "./db.js";

// =====================================================
// BIX MONGODB STORE
// =====================================================
//
// Completely separate from existing $ai.
//
// Collections:
// - bix_settings
// - bix_memory
//
// No existing AI collection is modified.
// =====================================================

const SETTINGS_COLLECTION =
    "bix_settings";

const MEMORY_COLLECTION =
    "bix_memory";

const SETTINGS_ID =
    "global";

const MAX_HISTORY_MESSAGES =
    12;

// =====================================================
// NORMALIZERS
// =====================================================

function normalizeChatId(chatId) {
    if (
        typeof chatId !== "string"
    ) {
        return "";
    }

    return chatId.trim();
}

function normalizeHistory(history) {
    if (!Array.isArray(history)) {
        return [];
    }

    return history
        .filter(item =>
            item &&
            (
                item.role === "user" ||
                item.role === "assistant"
            ) &&
            typeof item.content === "string" &&
            item.content.trim()
        )
        .slice(-MAX_HISTORY_MESSAGES)
        .map(item => ({
            role: item.role,
            content: item.content.trim()
        }));
}

// =====================================================
// DEFAULT SETTINGS
// =====================================================

const DEFAULT_SETTINGS = {
    enabled: true,
    updatedAt: new Date()
};

// =====================================================
// SETTINGS
// =====================================================

export async function getBixSettings() {
    try {
        const existing =
            await getDoc(
                SETTINGS_COLLECTION,
                SETTINGS_ID
            );

        if (!existing) {
            const created =
                await setDoc(
                    SETTINGS_COLLECTION,
                    SETTINGS_ID,
                    {
                        enabled:
                            DEFAULT_SETTINGS.enabled,

                        updatedAt:
                            DEFAULT_SETTINGS.updatedAt
                    }
                );

            return {
                enabled:
                    Boolean(created?.enabled ?? true)
            };
        }

        return {
            enabled:
                existing.enabled !== false
        };
    } catch (error) {
        console.log(
            "⚠️ BIX SETTINGS READ FALLBACK:",
            error?.message || error
        );

        return {
            enabled: true
        };
    }
}

// =====================================================
// BIX ON/OFF
// =====================================================

export async function isBixEnabled() {
    const settings =
        await getBixSettings();

    return settings.enabled;
}

export async function setBixEnabled(enabled) {
    const value =
        Boolean(enabled);

    try {
        const updated =
            await setDoc(
                SETTINGS_COLLECTION,
                SETTINGS_ID,
                {
                    enabled:
                        value,

                    updatedAt:
                        new Date()
                }
            );

        console.log(
            `🔎 BIX ${value ? "ENABLED" : "DISABLED"}`
        );

        return {
            enabled:
                Boolean(updated?.enabled ?? value)
        };
    } catch (error) {
        console.log(
            "⚠️ BIX SETTINGS WRITE FAILED:",
            error?.message || error
        );

        return {
            enabled: value,
            warning: error?.message || String(error)
        };
    }
}

// =====================================================
// MEMORY
// =====================================================

export async function getBixHistory(
    chatId
) {
    const safeChatId =
        normalizeChatId(chatId);

    if (!safeChatId) {
        return [];
    }

    try {
        const doc =
            await getDoc(
                MEMORY_COLLECTION,
                safeChatId
            );

        if (!doc) {
            return [];
        }

        return normalizeHistory(
            doc.history
        );
    } catch (error) {
        console.log(
            "⚠️ BIX HISTORY READ FALLBACK:",
            error?.message || error
        );

        return [];
    }
}

// =====================================================
// SAVE / APPEND MEMORY
// =====================================================

export async function saveBixHistory(
    chatId,
    history
) {
    const safeChatId =
        normalizeChatId(chatId);

    if (!safeChatId) {
        throw new Error(
            "Bix chatId is required."
        );
    }

    const safeHistory =
        normalizeHistory(
            history
        );

    try {
        const saved =
            await setDoc(
                MEMORY_COLLECTION,
                safeChatId,
                {
                    history:
                        safeHistory,

                    updatedAt:
                        new Date()
                }
            );

        return normalizeHistory(
            saved?.history ?? safeHistory
        );
    } catch (error) {
        console.log(
            "⚠️ BIX HISTORY WRITE FAILED:",
            error?.message || error
        );

        // Still return normalized history so callers can continue
        return safeHistory;
    }
}

export async function appendBixMessage(
    chatId,
    roleOrMessage,
    content
) {
    // Supports both:
    // appendBixMessage(chatId, "user", "text")
    // appendBixMessage(chatId, { role: "user", content: "text" })
    let role = roleOrMessage;
    let text = content;

    if (
        roleOrMessage &&
        typeof roleOrMessage === "object"
    ) {
        role = roleOrMessage.role;
        text = roleOrMessage.content ?? roleOrMessage.text;
    }

    if (
        role !== "user" &&
        role !== "assistant"
    ) {
        throw new Error(
            "Invalid Bix message role."
        );
    }

    if (
        typeof text !== "string" ||
        !text.trim()
    ) {
        throw new Error(
            "Bix message content is empty."
        );
    }

    const currentHistory =
        await getBixHistory(
            chatId
        );

    currentHistory.push({
        role,
        content:
            text.trim()
    });

    return await saveBixHistory(
        chatId,
        currentHistory
    );
}

// =====================================================
// CLEAR CHAT MEMORY
// =====================================================

export async function clearBixHistory(
    chatId
) {
    const safeChatId =
        normalizeChatId(chatId);

    if (!safeChatId) {
        return false;
    }

    try {
        await deleteDoc(
            MEMORY_COLLECTION,
            safeChatId
        );

        console.log(
            "🧹 BIX CHAT MEMORY CLEARED:",
            safeChatId
        );

        return true;
    } catch (error) {
        console.log(
            "⚠️ BIX HISTORY CLEAR FAILED:",
            error?.message || error
        );

        return false;
    }
}

// =====================================================
// CLEAR ALL BIX MEMORY
// =====================================================
//
// Owner-only command will use this later.
// It intentionally does NOT touch:
// - ai_memory
// - ai_replies
// - ai_sessions
// - WhatsApp session
// =====================================================

export async function clearAllBixMemory() {
    // This function is intentionally not implemented
    // using broad MongoDB deletion here.
    //
    // The owner-control layer will perform a controlled
    // collection clear with explicit confirmation.
    //
    // Keeping destructive DB operations out of the basic
    // store layer prevents accidental full deletion.

    throw new Error(
        "Global Bix memory clear must be executed through the controlled owner tool."
    );
}

// =====================================================
// EXPORTS
// =====================================================

export const bixStoreConfig = {
    settingsCollection:
        SETTINGS_COLLECTION,

    memoryCollection:
        MEMORY_COLLECTION,

    settingsId:
        SETTINGS_ID,

    maxHistoryMessages:
        MAX_HISTORY_MESSAGES
};
