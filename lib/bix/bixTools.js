import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { createRequire } from "module";

import {
    getProjectRoot,
    getCommandsPath,
    isSafeFileName,
    getCommandFile,
    backupFile,
    writeCommandFile,
    getCommandRoots
} from "./fileEditor.js";

import {
    getDoc,
    setDoc,
    deleteDoc
} from "./db.js";

import {
    getBotStatus,
    getBotHealth,
    getBotMemory,
    getBotProcess,
    startBotRuntime,
    restartBotRuntime,
    shutdownBotRuntime
} from "./botRuntime.js";

const execFileAsync =
    promisify(execFile);

const require =
    createRequire(import.meta.url);


// =====================================================
// PATHS
// =====================================================

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

const PROJECT_ROOT =
    getProjectRoot();

const COMMANDS_PATH =
    getCommandsPath();

const DATABASE_PATH =
    path.join(
        PROJECT_ROOT,
        "database"
    );

const LOG_PATH =
    path.join(
        PROJECT_ROOT,
        "logs"
    );

const BACKUP_PATH =
    path.join(
        PROJECT_ROOT,
        "data",
        "bix-backups"
    );

const TESTS_PATH =
    path.join(
        PROJECT_ROOT,
        "tests"
    );


// =====================================================
// LIMITS / SAFETY
// =====================================================

const MAX_READ_BYTES =
    250000;

const MAX_WRITE_BYTES =
    250000;

const MAX_OUTPUT_LENGTH =
    12000;

const COMMAND_TIMEOUT =
    15000;

const TEST_SUITE_TIMEOUT =
    120000;

const MAX_SCAN_FILES =
    5000;

const MAX_SEARCH_MATCHES =
    500;

const MAX_REFERENCE_MATCHES =
    500;

const MAX_PROJECT_MAP_ENTRIES =
    2000;

const MAX_TEST_FILES =
    100;

const MAX_DEPENDENCIES =
    500;

const MAX_MEMORY_ENTRIES =
    50;

const MAX_MEMORY_ITEM_LENGTH =
    4000;

const MAX_DIFF_LINES =
    1200;

const MAX_TEXT_SCAN_BYTES =
    300000;


// =====================================================
// PROTECTED / HEAVY DIRECTORIES
// =====================================================

const SKIP_DIRS =
    new Set([
        ".git",
        "node_modules",
        "session",
        "temp",
        "media",
        "piper-termux",
        "database_backup_before_mongo",
        "file-backups",
        ".cache",
        ".npm",
        "coverage",
        "dist",
        "build"
    ]);


// =====================================================
// SEARCHABLE FILE TYPES
// =====================================================

const SEARCH_EXTENSIONS =
    new Set([
        ".js",
        ".mjs",
        ".cjs",
        ".json",
        ".md",
        ".txt",
        ".yml",
        ".yaml"
    ]);

const CODE_EXTENSIONS =
    new Set([
        ".js",
        ".mjs",
        ".cjs"
    ]);


// =====================================================
// TEST FILE PATTERNS
// =====================================================

const TEST_NAME_PATTERNS = [
    /^test[-_].+\.(js|mjs|cjs)$/i,
    /^.+[-_]test\.(js|mjs|cjs)$/i,
    /^.+\.test\.(js|mjs|cjs)$/i,
    /^.+\.spec\.(js|mjs|cjs)$/i
];


// =====================================================
// BASIC HELPERS
// =====================================================

function safeText(value) {
    return String(
        value ?? ""
    ).trim();
}


function limitText(
    value,
    max = MAX_OUTPUT_LENGTH
) {
    const text =
        String(
            value ?? ""
        );

    if (
        text.length <= max
    ) {
        return text;
    }

    return (
        text.slice(
            0,
            max
        ) +
        "\n\n...[OUTPUT TRUNCATED]"
    );
}


function isInsideProject(
    target
) {
    const root =
        path.resolve(
            PROJECT_ROOT
        );

    const resolved =
        path.resolve(
            target
        );

    return (
        resolved === root ||
        resolved.startsWith(
            root + path.sep
        )
    );
}


function resolveProjectFile(
    relativePath
) {
    let clean =
        safeText(
            relativePath
        );

    if (!clean) {
        throw new Error(
            "File path is required."
        );
    }

    if (
        clean.includes("\0")
    ) {
        throw new Error(
            "Invalid file path."
        );
    }

    // Normalize separators
    clean = clean.replace(/\\/g, "/");

    // Strip leading ./
    while (clean.startsWith("./")) {
        clean = clean.slice(2);
    }

    const rootResolved =
        path.resolve(
            PROJECT_ROOT
        );

    // If absolute path is provided, only allow if inside project
    if (path.isAbsolute(clean)) {
        const abs =
            path.resolve(
                clean
            );

        if (
            abs === rootResolved ||
            abs.startsWith(
                rootResolved + path.sep
            )
        ) {
            return abs;
        }

        // Try strip common project-root prefixes from absolute-looking strings
        const rootPosix =
            rootResolved.split(path.sep).join("/");
        const absPosix =
            abs.split(path.sep).join("/");

        if (
            absPosix.startsWith(
                rootPosix + "/"
            )
        ) {
            return abs;
        }

        // Last resort: treat basename as project-relative if unique enough
        const base =
            path.basename(
                clean
            );

        if (
            base &&
            base !== clean
        ) {
            const candidate =
                path.resolve(
                    PROJECT_ROOT,
                    base
                );

            if (
                isInsideProject(
                    candidate
                ) &&
                isRegularFile(
                    candidate
                )
            ) {
                return candidate;
            }
        }

        throw new Error(
            "Access denied: file must stay inside project. Use project-relative path like commands/play.js or lib/bixTools.js"
        );
    }

    // Strip PROJECT_ROOT prefix if AI embeds it as relative-looking string
    const rootName =
        path.basename(
            rootResolved
        );

    if (
        clean.startsWith(
            rootName + "/"
        )
    ) {
        clean =
            clean.slice(
                rootName.length + 1
            );
    }

    // Strip leading "4T-Jawad/" etc if present
    const knownRoots = [
        "4T-Jawad/",
        "4t-jawad/",
        "ABIX/",
        "home/4T-Jawad/",
        "data/data/com.termux/files/home/4T-Jawad/"
    ];

    for (
        const prefix of knownRoots
    ) {
        if (
            clean.toLowerCase().startsWith(
                prefix.toLowerCase()
            )
        ) {
            clean =
                clean.slice(
                    prefix.length
                );
            break;
        }
    }

    const target =
        path.resolve(
            PROJECT_ROOT,
            clean
        );

    if (
        !isInsideProject(
            target
        )
    ) {
        throw new Error(
            "Access denied: file must stay inside project. Use project-relative path like commands/play.js or lib/bixTools.js"
        );
    }

    return target;
}


function normalizeProjectRelative(
    filePath
) {
    const clean =
        safeText(
            filePath
        );

    if (!clean) {
        throw new Error(
            "File path is required."
        );
    }

    const target =
        resolveProjectFile(
            clean
        );

    return (
        path
            .relative(
                PROJECT_ROOT,
                target
            )
            .split(
                path.sep
            )
            .join("/") ||
        "."
    );
}


function ensureDirectory(
    dir
) {
    if (
        !fs.existsSync(
            dir
        )
    ) {
        fs.mkdirSync(
            dir,
            {
                recursive: true
            }
        );
    }
}


function validateCommandName(
    name
) {
    const commandName =
        safeText(
            name
        );

    if (
        !commandName ||
        !isSafeFileName(
            commandName
        )
    ) {
        throw new Error(
            "Invalid command name. Use only letters, numbers, _ and -."
        );
    }

    return commandName;
}


function getCommandSource(
    name
) {
    const commandName =
        validateCommandName(
            name
        );

    const filePath =
        getCommandFile(
            commandName
        );

    if (!filePath) {
        throw new Error(
            "Invalid command file."
        );
    }

    return {
        commandName,
        filePath
    };
}


function pathExists(
    target
) {
    try {
        return fs.existsSync(
            target
        );
    } catch {
        return false;
    }
}


function isRegularFile(
    target
) {
    try {
        return fs
            .statSync(
                target
            )
            .isFile();
    } catch {
        return false;
    }
}


function isRegularDirectory(
    target
) {
    try {
        return fs
            .statSync(
                target
            )
            .isDirectory();
    } catch {
        return false;
    }
}


function readUtf8File(
    target,
    maxBytes = MAX_READ_BYTES
) {
    if (
        !isRegularFile(
            target
        )
    ) {
        throw new Error(
            "Target is not a readable file."
        );
    }

    const stat =
        fs.statSync(
            target
        );
      if (
        stat.size >
        maxBytes
    ) {
        throw new Error(
            `File is too large to read safely. Size: ${stat.size} bytes.`
        );
    }

    return fs.readFileSync(
        target,
        "utf8"
    );
}


function writeUtf8File(
    target,
    content
) {
    const text =
        String(
            content ?? ""
        );

    const bytes =
        Buffer.byteLength(
            text,
            "utf8"
        );

    if (
        bytes >
        MAX_WRITE_BYTES
    ) {
        throw new Error(
            `File content is too large. Maximum allowed: ${MAX_WRITE_BYTES} bytes.`
        );
    }

    ensureDirectory(
        path.dirname(
            target
        )
    );

    fs.writeFileSync(
        target,
        text,
        "utf8"
    );

    return {
        bytes,
        path: target
    };
}


function listDirectoryEntries(
    dir,
    options = {}
) {
    const {
        recursive = false,
        maxEntries = MAX_SCAN_FILES
    } = options;

    const output = [];
    const queue = [
        dir
    ];

    while (
        queue.length &&
        output.length < maxEntries
    ) {
        const current =
            queue.shift();

        let entries;

        try {
            entries =
                fs.readdirSync(
                    current,
                    {
                        withFileTypes: true
                    }
                );
        } catch {
            continue;
        }

        for (
            const entry of entries
        ) {
            if (
                output.length >=
                maxEntries
            ) {
                break;
            }

            const fullPath =
                path.join(
                    current,
                    entry.name
                );

            const relative =
                path
                    .relative(
                        PROJECT_ROOT,
                        fullPath
                    )
                    .split(
                        path.sep
                    )
                    .join("/");

            if (
                entry.isDirectory()
            ) {
                if (
                    SKIP_DIRS.has(
                        entry.name
                    )
                ) {
                    continue;
                }

                output.push({
                    path: relative,
                    type: "directory"
                });

                if (
                    recursive
                ) {
                    queue.push(
                        fullPath
                    );
                }

                continue;
            }

            if (
                entry.isFile()
            ) {
                output.push({
                    path: relative,
                    type: "file"
                });
            }
        }
    }

    return output;
}


function walkFiles(
    root,
    options = {}
) {
    const {
        maxFiles = MAX_SCAN_FILES,
        extensions = null
    } = options;

    const results = [];
    const stack = [
        root
    ];

    while (
        stack.length &&
        results.length < maxFiles
    ) {
        const current =
            stack.pop();

        let entries;

        try {
            entries =
                fs.readdirSync(
                    current,
                    {
                        withFileTypes: true
                    }
                );
        } catch {
            continue;
        }

        for (
            const entry of entries
        ) {
            if (
                results.length >=
                maxFiles
            ) {
                break;
            }

            if (
                entry.isDirectory()
            ) {
                if (
                    SKIP_DIRS.has(
                        entry.name
                    )
                ) {
                    continue;
                }

                stack.push(
                    path.join(
                        current,
                        entry.name
                    )
                );

                continue;
            }

            if (
                !entry.isFile()
            ) {
                continue;
            }

            const fullPath =
                path.join(
                    current,
                    entry.name
                );

            if (
                extensions
            ) {
                const ext =
                    path.extname(
                        entry.name
                    ).toLowerCase();

                if (
                    !extensions.has(
                        ext
                    )
                ) {
                    continue;
                }
            }

            results.push(
                fullPath
            );
        }
    }

    return results;
}


function relativePath(
    absolutePath
) {
    return path
        .relative(
            PROJECT_ROOT,
            absolutePath
        )
        .split(
            path.sep
        )
        .join("/");
}


function safeJsonParse(
    value,
    fallback = null
) {
    try {
        return JSON.parse(
            value
        );
    } catch {
        return fallback;
    }
}


function cloneJson(
    value
) {
    return safeJsonParse(
        JSON.stringify(
            value
        ),
        null
    );
}


function nowIso() {
    return new Date()
        .toISOString();
}


function result(
    ok,
    data = {},
    error = null
) {
    const flag = Boolean(ok);
    return {
        ok: flag,
        success: flag,
        ...data,
        ...(error
            ? {
                error: String(
                    error
                )
            }
            : {}),
        timestamp:
            nowIso()
    };
}


function success(
    data = {}
) {
    return result(
        true,
        data
    );
}


function failure(
    error,
    data = {}
) {
    return result(
        false,
        data,
        error instanceof Error
            ? error.message
            : error
    );
}


function normalizeBoolean(
    value,
    defaultValue = false
) {
    if (
        typeof value ===
        "boolean"
    ) {
        return value;
    }

    if (
        typeof value ===
        "string"
    ) {
        const normalized =
            value
                .trim()
                .toLowerCase();

        if (
            [
                "true",
                "yes",
                "1",
                "on",
                "enable",
                "enabled"
            ].includes(
                normalized
            )
        ) {
            return true;
        }

        if (
            [
                "false",
                "no",
                "0",
                "off",
                "disable",
                "disabled"
            ].includes(
                normalized
            )
        ) {
            return false;
        }
    }

    return defaultValue;
}


function requireConfirmation(
    input,
    action
) {
    const confirmed =
        input?.confirmed === true;

    if (
        !confirmed
    ) {
        throw new Error(
            `Confirmation required before ${action}. Pass confirmed: true.`
        );
    }
}


function normalizeArray(
    value
) {
    if (
        Array.isArray(
            value
        )
    ) {
        return value;
    }

    if (
        value === undefined ||
        value === null
    ) {
        return [];
    }

    return [
        value
    ];
}


function normalizeJid(
    jid
) {
    return safeText(
        jid
    );
}


function validateJid(
    jid
) {
    const value =
        normalizeJid(
            jid
        );

    if (
        !value ||
        !value.includes("@")
    ) {
        throw new Error(
            "A valid WhatsApp JID is required."
        );
    }

    return value;
}


// =====================================================
// CRITICAL PATH PROTECTION
// =====================================================

const CRITICAL_MODULE_PATHS =
    new Set([
        "index.js",
        "events/message.js",
        "events/connection.js",
        "lib/socket.js",
        "lib/botRuntime.js",
        "lib/bixTools.js",
        "lib/bixAI.js",
        "lib/db.js",
        "lib/mongodb.js"
    ]);


function isCriticalModulePath(
    filePath
) {
    const normalized =
        normalizeProjectRelative(
            filePath
        ).toLowerCase();

    return CRITICAL_MODULE_PATHS
        .has(
            normalized
        );
}


function assertProjectWritablePath(
    filePath
) {
    const normalized =
        normalizeProjectRelative(
            filePath
        );

    const parts =
        normalized
            .split("/")
            .filter(Boolean);

    const first =
        parts[0]?.toLowerCase();

    if (
        [
            ".git",
            "node_modules",
            "session",
            "database_backup_before_mongo",
            ".cache",
            ".npm",
            "coverage",
            "dist",
            "build",
            "piper-termux",
            "auth_info"
        ].includes(
            first
        )
    ) {
        throw new Error(
            `Protected path cannot be modified: ${normalized}`
        );
    }

    if (
        first === "database" &&
        parts[1] !==
            "file-backups"
    ) {
        throw new Error(
            `Direct database path modification is blocked: ${normalized}`
        );
    }

    const base =
        path.basename(
            normalized
        ).toLowerCase();

    if (
        base.startsWith(
            ".env"
        )
    ) {
        throw new Error(
            "Environment files cannot be modified by Bix."
        );
    }

    if (
        base ===
        "package-lock.json" ||
        base ===
        "package.json"
    ) {
        throw new Error(
            "Package manifest files cannot be modified by this file tool."
        );
    }

    return normalized;
}


// =====================================================
// SOCKET SOURCE OF TRUTH
// =====================================================

let bixSocketOverride =
    null;




// =====================================================
// BOT OWNER AWARENESS
// =====================================================

async function getBotOwners() {
    const owners = new Set();

    try {
        const settings =
            await getDoc(
                "settings",
                "main"
            );

        const list =
            settings?.owners ||
            settings?.owner ||
            settings?.botOwners ||
            [];

        for (
            const item of normalizeArray(
                list
            )
        ) {
            const value =
                safeText(
                    item
                );

            if (
                value
            ) {
                owners.add(
                    value.replace(
                        /\D/g,
                        ""
                    )
                );
            }
        }
    } catch {
        // settings may be unavailable
    }

    try {
        const envOwners =
            safeText(
                process.env.BOT_OWNERS ||
                process.env.OWNER ||
                process.env.OWNERS ||
                process.env.OWNER_NUMBER ||
                process.env.BOT_NUMBER ||
                ""
            ) + " " + safeText(process.env.SECONDARY_OWNER_NUMBERS || process.env.SECONDARY_OWNER || "");

        if (
            envOwners
        ) {
            for (
                const part of envOwners.split(
                    /[,\s]+/
                )
            ) {
                const digits =
                    part.replace(
                        /\D/g,
                        ""
                    );

                if (
                    digits
                ) {
                    owners.add(
                        digits
                    );
                }
            }
        }
    } catch {
        // ignore
    }

    return [
        ...owners
    ].filter(
        Boolean
    );
}


async function isBotOwner(
    jidOrNumber
) {
    const raw =
        safeText(
            jidOrNumber
        );

    if (
        !raw
    ) {
        return false;
    }

    const digits =
        raw.replace(
            /\D/g,
            ""
        );

    const owners =
        await getBotOwners();

    if (
        !owners.length
    ) {
        return false;
    }

    return owners.some(
        owner =>
            owner ===
                digits ||
            digits.endsWith(
                owner
            ) ||
            owner.endsWith(
                digits
            )
    );
}

export function setBixSocket(
    socket
) {
    bixSocketOverride =
        socket || null;

    return Boolean(
        bixSocketOverride
    );
}


function resolveBixSocket() {
    if (
        bixSocketOverride
    ) {
        return bixSocketOverride;
    }

    if (
        globalThis.__BIX_SOCKET__
    ) {
        return globalThis
            .__BIX_SOCKET__;
    }

    try {
        const runtimeSocket =
            getRuntimeSocket
                ? getRuntimeSocket()
                : null;

        if (
            runtimeSocket
        ) {
            return runtimeSocket;
        }
    } catch {
        // Runtime socket getter may not be available.
    }

    return null;
}


// =====================================================
// RUNTIME SOCKET COMPATIBILITY
// =====================================================

let getRuntimeSocket =
    null;

try {
    const runtimeModule =
        await import(
            "./botRuntime.js"
        );

    if (
        typeof runtimeModule
            .getRuntimeSocket ===
        "function"
    ) {
        getRuntimeSocket =
            runtimeModule
                .getRuntimeSocket;
    }
} catch {
    getRuntimeSocket =
        null;
}


// =====================================================
// FILE / COMMAND HELPERS
// =====================================================

function getCommandFiles() {
    const roots = typeof getCommandRoots === "function" ? getCommandRoots() : [COMMANDS_PATH];
    const found = [];
    const walk = (dir) => {
        if (!isRegularDirectory(dir)) return;
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile() && entry.name.toLowerCase().endsWith(".js")) found.push(full);
        }
    };
    for (const root of roots) walk(root);
    return [...new Set(found)].sort();
}


function commandFileName(
    commandName
) {
    const clean =
        validateCommandName(
            commandName
        );

    return `${clean}.js`;
}


function commandPathFromName(
    commandName
) {
    const file =
        commandFileName(
            commandName
        );

    const existing = getCommandFile(commandName);
    if (existing && isRegularFile(existing)) return existing;
    const target =
        path.resolve(
            COMMANDS_PATH,
            file
        );

    if (
        !isInsideProject(
            target
        )
    ) {
        throw new Error(
            "Command path escaped project root."
        );
    }

    return target;
}


function commandNameFromFile(
    filePath
) {
    const base =
        path.basename(
            filePath,
            ".js"
        );

    return base;
}


function commandNames() {
    return getCommandFiles()
        .map(
            commandNameFromFile
        )
        .sort(
            (a, b) =>
                a.localeCompare(
                    b
                )
        );
}


// =====================================================
// CONFIRMATION / STATE HELPERS
// =====================================================

const sensitiveActions =
    new Set([
        "delete",
        "rollback",
        "restart",
        "shutdown",
        "block",
        "unblock",
        "remove",
        "promote",
        "demote",
        "leave",
        "broadcast",
        "write",
        "disable",
        "reset",
        "clear"
    ]);


function isSensitiveAction(
    action
) {
    return sensitiveActions.has(
        safeText(
            action
        ).toLowerCase()
    );
}


function ensureSensitiveConfirmation(
    action,
    input = {}
) {
    if (
        isSensitiveAction(
            action
        )
    ) {
        requireConfirmation(
            input,
            action
        );
    }
}


// =====================================================
// MEMORY HELPERS
// =====================================================

const BIX_MEMORY_COLLECTION =
    "bix_memory";


const BIX_MEMORY_DOCUMENT =
    "main";


async function readBixMemory() {
    try {
        const doc =
            await getDoc(
                BIX_MEMORY_COLLECTION,
                BIX_MEMORY_DOCUMENT
            );

        if (
            !doc
        ) {
            return {
                entries: []
            };
        }

        if (
            Array.isArray(
                doc.entries
            )
        ) {
            return doc;
        }

        return {
            ...doc,
            entries: []
        };
    } catch {
        return {
            entries: []
        };
    }
}


async function writeBixMemory(
    memory
) {
    const safeMemory =
        cloneJson(
            memory
        ) || {
            entries: []
        };

    await setDoc(
        BIX_MEMORY_COLLECTION,
        BIX_MEMORY_DOCUMENT,
        safeMemory
    );

    return safeMemory;
}


function normalizeMemoryEntries(
    entries
) {
    return normalizeArray(
        entries
    )
        .filter(
            entry =>
                entry !==
                    null &&
                entry !==
                    undefined
        )
        .slice(
            -MAX_MEMORY_ENTRIES
        )
        .map(
            entry => {
                if (
                    typeof entry ===
                    "string"
                ) {
                    return {
                        text:
                            entry.slice(
                                0,
                                MAX_MEMORY_ITEM_LENGTH
                            ),
                        timestamp:
                            nowIso()
                    };
                }

                return {
                    ...entry,
                    timestamp:
                        entry.timestamp ||
                        nowIso()
                };
            }
        );
}


// =====================================================
// TOOL 1 — READ FILE
// =====================================================

export async function readFileTool(
    input = {}
) {
    try {
        const filePath =
            normalizeProjectRelative(
                input.path ||
                input.file ||
                input.filePath
            );

        const target =
            resolveProjectFile(
                filePath
            );

        const content =
            readUtf8File(
                target,
                input.maxBytes ||
                    MAX_READ_BYTES
            );

        return success({
            path: filePath,
            content,
            bytes:
                Buffer.byteLength(
                    content,
                    "utf8"
                )
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 2 — WRITE FILE
// =====================================================

export async function writeFileTool(
    input = {}
) {
    try {
        const filePath =
            normalizeProjectRelative(
                input.path ||
                input.file ||
                input.filePath
            );

        assertProjectWritablePath(
            filePath
        );

        const target =
            resolveProjectFile(
                filePath
            );

        const content =
            String(
                input.content ??
                ""
            );

        let backup = null;

        if (
            isRegularFile(
                target
            )
        ) {
            const existing =
                fs.readFileSync(
                    target,
                    "utf8"
                );

            const backupName =
                path.basename(
                    target,
                    path.extname(
                        target
                    )
                ) ||
                "file";

            backup =
                backupFile(
                    backupName,
                    existing
                );
        }

        const written =
            writeUtf8File(
                target,
                content
            );

        return success({
            path: filePath,
            bytes:
                written.bytes,
            backup
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 3 — ROLLBACK FILE
// =====================================================

export async function rollbackFileTool(
    input = {}
) {
    try {
        requireConfirmation(
            input,
            "rollback this file"
        );

        const filePath =
            normalizeProjectRelative(
                input.path ||
                input.file ||
                input.filePath
            );

        assertProjectWritablePath(
            filePath
        );

        const target =
            resolveProjectFile(
                filePath
            );

        const backup =
            safeText(
                input.backup ||
                input.backupPath
            );

        if (!backup) {
            throw new Error(
                "Backup path is required for rollback."
            );
        }

        const backupRelative = normalizeProjectRelative(backup);
        if (!backupRelative.toLowerCase().startsWith("data/bix-backups/")) {
            throw new Error(
                "Rollback is restricted to data/bix-backups created by Bix."
            );
        }

        const backupTarget =
            resolveProjectFile(
                backupRelative
            );

        if (
            !isRegularFile(
                backupTarget
            )
        ) {
            throw new Error(
                "Backup file does not exist."
            );
        }

        const bytes =
            fs.readFileSync(
                backupTarget
            );

        fs.writeFileSync(
            target,
            bytes
        );

        const restored =
            fs.readFileSync(
                target
            );

        if (
            !restored.equals(
                bytes
            )
        ) {
            throw new Error(
                "Rollback verification failed: restored bytes do not match backup."
            );
        }

        return success({
            path: filePath,
            backup: backupRelative,
            restoredBytes:
                restored.length,
            verified: true
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================

// =====================================================
// TOOL 3.5 — DELETE FILE
// =====================================================
export async function deleteFileTool(input = {}) {
    try {
        requireConfirmation(input, "delete this file");
        const filePath = normalizeProjectRelative(input.path || input.file || input.filePath);
        assertProjectWritablePath(filePath);
        const target = resolveProjectFile(filePath);
        if (!isRegularFile(target)) throw new Error(`File does not exist: ${filePath}`);
        const existing = fs.readFileSync(target);
        const backupName = path.basename(target) || "file";
        const stamp = new Date().toISOString().replace(/[.:]/g, "-");
        const backup = path.join(BACKUP_PATH, `delete-${backupName}-${stamp}.bak`);
        fs.mkdirSync(BACKUP_PATH, { recursive: true });
        fs.writeFileSync(backup, existing);
        fs.unlinkSync(target);
        return success({ path: filePath, deleted: true, backup: path.relative(PROJECT_ROOT, backup).split(path.sep).join("/") });
    } catch (error) {
        return failure(error);
    }
}

// =====================================================
// TOOL 4 — CREATE COMMAND
// =====================================================

export async function createCommandTool(
    input = {}
) {
    try {
        const commandName =
            validateCommandName(
                input.name ||
                input.command
            );

        const filePath =
            commandPathFromName(
                commandName
            );

        if (
            pathExists(
                filePath
            )
        ) {
            throw new Error(
                `Command already exists: ${commandName}`
            );
        }

        const content =
            String(
                input.content ??
                input.code ??
                ""
            );

        if (
            !content.trim()
        ) {
            throw new Error(
                "Command content is required."
            );
        }

        writeCommandFile(
            commandName,
            content
        );

        return success({
            command:
                commandName,
            path:
                relativePath(
                    filePath
                )
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 5 — EDIT COMMAND
// =====================================================

export async function editCommandTool(
    input = {}
) {
    try {
        const commandName =
            validateCommandName(
                input.name ||
                input.command
            );

        const filePath =
            commandPathFromName(
                commandName
            );

        if (
            !isRegularFile(
                filePath
            )
        ) {
            throw new Error(
                `Command does not exist: ${commandName}`
            );
        }

        const existing =
            fs.readFileSync(
                filePath,
                "utf8"
            );

        const backup =
            backupFile(
                commandName,
                existing
            );

        const content =
            String(
                input.content ??
                input.code ??
                ""
            );

        if (
            !content.trim()
        ) {
            throw new Error(
                "Edited command content is required."
            );
        }

        writeCommandFile(
            commandName,
            content
        );

        return success({
            command:
                commandName,
            path:
                relativePath(
                    filePath
                ),
            backup
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 6 — DELETE COMMAND
// =====================================================

export async function deleteCommandTool(
    input = {}
) {
    try {
        requireConfirmation(
            input,
            "delete this command"
        );

        const commandName =
            validateCommandName(
                input.name ||
                input.command
            );

        const filePath =
            commandPathFromName(
                commandName
            );

        if (
            !isRegularFile(
                filePath
            )
        ) {
            throw new Error(
                `Command does not exist: ${commandName}`
            );
        }

        const existing =
            fs.readFileSync(
                filePath,
                "utf8"
            );

        const backup =
            backupFile(
                commandName,
                existing
            );

        fs.unlinkSync(
            filePath
        );

        return success({
            command:
                commandName,
            deleted: true,
            backup
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 7 — LIST COMMANDS
// =====================================================

export async function listCommandsTool(
    input = {}
) {
    try {
        const commands =
            commandNames();

        return success({
            commands,
            count:
                commands.length
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 8 — INSPECT COMMAND
// =====================================================

export async function inspectCommandTool(
    input = {}
) {
    try {
        const commandName =
            validateCommandName(
                input.name ||
                input.command
            );

        const filePath =
            commandPathFromName(
                commandName
            );

        if (
            !isRegularFile(
                filePath
            )
        ) {
            throw new Error(
                `Command does not exist: ${commandName}`
            );
        }

        const content =
            readUtf8File(
                filePath
            );

        return success({
            command:
                commandName,
            path:
                relativePath(
                    filePath
                ),
            bytes:
                Buffer.byteLength(
                    content,
                    "utf8"
                ),
            content
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 9 — SYNTAX TEST
// =====================================================

export async function syntaxTestTool(
    input = {}
) {
    try {
        const filePath =
            normalizeProjectRelative(
                input.path ||
                input.file ||
                input.filePath
            );

        const target =
            resolveProjectFile(
                filePath
            );

        if (
            !isRegularFile(
                target
            )
        ) {
            throw new Error(
                "File does not exist."
            );
        }

        const ext =
            path.extname(
                target
            ).toLowerCase();

        if (
            !CODE_EXTENSIONS.has(
                ext
            )
        ) {
            throw new Error(
                "Syntax test currently supports JavaScript files only."
            );
        }

        const {
            stdout,
            stderr
        } =
            await execFileAsync(
                process.execPath,
                [
                    "--check",
                    target
                ],
                {
                    timeout:
                        COMMAND_TIMEOUT,
                    maxBuffer:
                        1024 * 1024
                }
            );

        return success({
            path: filePath,
            valid: true,
            stdout:
                limitText(
                    stdout
                ),
            stderr:
                limitText(
                    stderr
                )
        });
    } catch (
        error
    ) {
        return failure(
            error,
            {
                valid: false,
                stdout:
                    limitText(
                        error.stdout
                    ),
                stderr:
                    limitText(
                        error.stderr
                    )
            }
        );
    }
}


// =====================================================
// TOOL 10 — RUN TEST
// =====================================================

export async function runTestTool(
    input = {}
) {
    try {
        const testPath =
            normalizeProjectRelative(
                input.filePath ||
                input.path ||
                input.file ||
                input.test
            );

        const target =
            resolveProjectFile(
                testPath
            );

        if (
            !isRegularFile(
                target
            )
        ) {
            throw new Error(
                "Test file does not exist."
            );
        }

        const {
            stdout,
            stderr
        } =
            await execFileAsync(
                process.execPath,
                [
                    target
                ],
                {
                    cwd:
                        PROJECT_ROOT,
                    timeout:
                        input.timeout ||
                        TEST_SUITE_TIMEOUT,
                    maxBuffer:
                        2 * 1024 * 1024
                }
            );

        return success({
            filePath: testPath,
            path: testPath,
            exitCode: 0,
            stdout:
                limitText(
                    stdout,
                    MAX_OUTPUT_LENGTH * 2
                ),
            stderr:
                limitText(
                    stderr,
                    MAX_OUTPUT_LENGTH * 2
                )
        });
    } catch (
        error
    ) {
        return failure(
            error,
            {
                path:
                    input.filePath ||
                    input.path ||
                    input.file ||
                    input.test,
                exitCode:
                    error.code ??
                    null,
                stdout:
                    limitText(
                        error.stdout,
                        MAX_OUTPUT_LENGTH * 2
                    ),
                stderr:
                    limitText(
                        error.stderr,
                        MAX_OUTPUT_LENGTH * 2
                    )
            }
        );
    }
}


// =====================================================
// TOOL 11 — READ LOGS
// =====================================================

export async function readLogsTool(
    input = {}
) {
    try {
        const requested =
            safeText(
                input.path
            );

        const target =
            requested
                ? resolveProjectFile(
                    requested
                )
                : LOG_PATH;

        if (
            !isRegularDirectory(
                target
            ) &&
            !isRegularFile(
                target
            )
        ) {
            throw new Error(
                "Log path does not exist."
            );
        }

        if (
            isRegularFile(
                target
            )
        ) {
            const content =
                readUtf8File(
                    target,
                    input.maxBytes ||
                        MAX_READ_BYTES
                );

            return success({
                path:
                    relativePath(
                        target
                    ),
                content
            });
        }

        const files =
            walkFiles(
                target,
                {
                    maxFiles:
                        input.maxFiles ||
                        50,
                    extensions:
                        new Set([
                            ".log",
                            ".txt"
                        ])
                }
            );

        const logs =
            files.map(
                file => ({
                    path:
                        relativePath(
                            file
                        ),
                    content:
                        (() => {
                            try {
                                return readUtf8File(
                                    file,
                                    input.maxBytesPerFile ||
                                        50000
                                );
                            } catch (
                                error
                            ) {
                                return `[READ ERROR] ${error.message}`;
                            }
                        })()
                })
            );

        return success({
            logs,
            count:
                logs.length
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}
// =====================================================
// CONTROLLED RUN COMMAND
// =====================================================

const SAFE_COMMANDS = {

    pwd: {
        executable:
            "pwd",

        args:
            []
    },


    node_version: {
        executable:
            "node",

        args:
            [
                "--version"
            ]
    },


    npm_version: {
        executable:
            "npm",

        args:
            [
                "--version"
            ]
    },


    npm_list: {
        executable:
            "npm",

        args:
            [
                "list",
                "--depth=0"
            ]
    },


    project_check: {
        executable:
            "node",

        args:
            [
                "--check",
                "index.js"
            ]
    }
};


export async function runCommandTool({
    command
}) {
    const name =
        safeText(
            command
        ).toLowerCase();

    const definition =
        SAFE_COMMANDS[
            name
        ];

    if (!definition) {
        throw new Error(
            "Command is not allowed. Available controlled commands: " +
            Object.keys(
                SAFE_COMMANDS
            ).join(
                ", "
            )
        );
    }

    try {
        const result =
            await execFileAsync(
                definition.executable,
                definition.args,
                {
                    cwd:
                        PROJECT_ROOT,

                    timeout:
                        COMMAND_TIMEOUT,

                    maxBuffer:
                        1024 *
                        1024
                }
            );

        return {
            success:
                true,

            command:
                name,

            stdout:
                limitText(
                    result.stdout
                ),

            stderr:
                limitText(
                    result.stderr
                )
        };
    } catch (
        error
    ) {
        return {
            success:
                false,

            command:
                name,

            stdout:
                limitText(
                    error.stdout
                ),

            stderr:
                limitText(
                    error.stderr
                ),

            error:
                limitText(
                    error.message
                )
        };
    }
}


// =====================================================
// MONGO CONFIG
// =====================================================

const ALLOWED_MONGO_COLLECTIONS = [
    "users",
    "groups",
    "settings",
    "banned",
    "transactions",
    "reminders",
    "ai_memory",
    "ai_replies",
    "economy_settings",
    "bix_settings",
    "bix_memory"
];


function validateMongoCollection(
    collection
) {
    const name =
        safeText(
            collection
        );

    if (
        !ALLOWED_MONGO_COLLECTIONS.includes(
            name
        )
    ) {
        throw new Error(
            "Mongo collection is not allowed."
        );
    }

    return name;
}


// =====================================================
// DEPENDENCY CHECK
// =====================================================

export async function checkDependenciesTool() {
    const packageJson =
        getPackageJson();

    const dependencies = {
        ...(packageJson.dependencies ||
            {}),

        ...(packageJson.devDependencies ||
            {})
    };

    const names =
        Object.keys(
            dependencies
        ).slice(
            0,
            MAX_DEPENDENCIES
        );

    const results =
        names.map(
            name =>
                summarizeDependency(
                    name,
                    dependencies[
                        name
                    ]
                )
        );

    return {
        success:
            true,

        total:
            results.length,

        missing:
            results.filter(
                item =>
                    !item.installed
            ).length,

        dependencies:
            results
    };
}


// =====================================================
// POWER 28: DEPENDENCY AUDIT
// =====================================================

export async function dependencyAuditTool({
    includeTransitive = true
} = {}) {
    const packageJson =
        getPackageJson();

    const direct = {
        ...(packageJson.dependencies ||
            {}),

        ...(packageJson.devDependencies ||
            {})
    };

    const audit =
        Object.entries(
            direct
        )
        .slice(
            0,
            MAX_DEPENDENCIES
        )
        .map(
            ([
                name,
                requestedVersion
            ]) =>
                summarizeDependency(
                    name,
                    requestedVersion
                )
        );

    let npmList =
        null;

    let npmListError =
        null;

    if (
        includeTransitive
    ) {
        try {
            const result =
                await execFileAsync(
                    "npm",
                    [
                        "list",
                        "--depth=0",
                        "--json"
                    ],
                    {
                        cwd:
                            PROJECT_ROOT,

                        timeout:
                            COMMAND_TIMEOUT,

                        maxBuffer:
                            2 *
                            1024 *
                            1024
                    }
                );

            npmList =
                JSON.parse(
                    result.stdout ||
                    "{}"
                );
        } catch (
            error
        ) {
            try {
                npmList =
                    JSON.parse(
                        error.stdout ||
                        "{}"
                    );
            } catch {
                npmListError =
                    limitText(
                        error.stderr ||
                        error.message
                    );
            }
        }
    }

    const lockfiles =
        getLockfileInfo();

    const packageLock =
        path.join(
            PROJECT_ROOT,
            "package-lock.json"
        );

    let lockfilePackageCount =
        null;

    if (
        lockfiles.packageLock &&
        isRegularFile(
            packageLock
        )
    ) {
        try {
            const lock =
                JSON.parse(
                    readUtf8File(
                        packageLock,
                        2000000
                    )
                );

            lockfilePackageCount =
                lock.packages
                    ? Object.keys(
                        lock.packages
                    ).length
                    : null;
        } catch {
            lockfilePackageCount =
                null;
        }
    }

    return {
        success:
            true,

        packageName:
            packageJson.name ||
            null,

        packageVersion:
            packageJson.version ||
            null,

        directDependencyCount:
            audit.length,

        missingDirectDependencies:
            audit
                .filter(
                    item =>
                        !item.installed
                )
                .map(
                    item =>
                        item.name
                ),

        dependencies:
            audit,

        lockfiles,

        lockfilePackageCount,

        npmListAvailable:
            Boolean(
                npmList
            ),

        npmListError,

        npmListProblems:
            npmList?.problems ||
            [],

        npmListDependencyCount:
            npmList?.dependencies
                ? Object.keys(
                    npmList.dependencies
                ).length
                : null
    };
}


// =====================================================
// MONGO TOOLS
// =====================================================

export async function mongoReadTool({
    collection,
    id
}) {
    const safeCollection =
        validateMongoCollection(
            collection
        );

    const safeId =
        safeText(
            id
        );

    if (!safeId) {
        throw new Error(
            "Mongo document id is required."
        );
    }

    const document =
        await getDoc(
            safeCollection,
            safeId
        );

    return {
        success:
            true,

        collection:
            safeCollection,

        id:
            safeId,

        document:
            document ||
            null
    };
}


export async function mongoUpdateTool({
    collection,
    id,
    data = {},
    mode = "set"
}) {
    const safeCollection =
        validateMongoCollection(
            collection
        );

    const safeId =
        safeText(
            id
        );

    if (!safeId) {
        throw new Error(
            "Mongo document id is required."
        );
    }

    if (
        !data ||
        typeof data !==
            "object" ||
        Array.isArray(
            data
        )
    ) {
        throw new Error(
            "Mongo update data must be an object."
        );
    }

    const normalizedMode =
        safeText(
            mode
        ).toLowerCase();

    if (
        normalizedMode ===
        "delete"
    ) {
        await deleteDoc(
            safeCollection,
            safeId
        );

        return {
            success:
                true,

            collection:
                safeCollection,

            id:
                safeId,

            deleted:
                true
        };
    }

    if (
        normalizedMode !==
        "set"
    ) {
        throw new Error(
            "Only controlled Mongo update mode 'set' or 'delete' is allowed."
        );
    }

    const existing =
        await getDoc(
            safeCollection,
            safeId
        );

    const updated = {
        ...(existing || {}),
        ...data
    };

    await setDoc(
        safeCollection,
        safeId,
        updated
    );

    return {
        success:
            true,

        collection:
            safeCollection,

        id:
            safeId,

        document:
            updated
    };
}


// =====================================================
// TOOL 16 — CLEAR BIX MEMORY
// =====================================================

export async function clearBixMemoryTool(
    input = {}
) {
    try {
        requireConfirmation(
            input,
            "clear Bix memory"
        );

        await deleteDoc(
            BIX_MEMORY_COLLECTION,
            BIX_MEMORY_DOCUMENT
        );

        return success({
            cleared:
                true,

            collection:
                BIX_MEMORY_COLLECTION,

            id:
                BIX_MEMORY_DOCUMENT
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// BOT RUNTIME TOOLS
// =====================================================

export async function botStatusTool() {
    try {
        return success({
            status:
                getBotStatus()
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


export async function botHealthTool() {
    try {
        const owners =
            await getBotOwners();

        return success({
            health:
                getBotHealth(),
            owners,
            socketConnected:
                Boolean(
                    resolveBixSocket()
                ),
            projectRoot:
                PROJECT_ROOT
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


export async function botUptimeTool() {
    try {
        const status =
            getBotStatus();

        const uptime =
            status?.uptime ??
            process.uptime();

        return success({
            uptime,
            uptimeSeconds:
                Number(
                    uptime
                ),
            uptimeHuman:
                formatDuration(
                    Number(
                        uptime
                    )
                )
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


export async function botMemoryTool() {
    try {
        return success({
            memory:
                getBotMemory()
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


export async function botProcessTool() {
    try {
        return success({
            process:
                getBotProcess()
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


export async function botStartTool(
    input = {}
) {
    try {
        return success({
            result:
                await startBotRuntime(
                    input
                )
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


export async function botRestartTool(
    input = {}
) {
    try {
        requireConfirmation(
            input,
            "restart the bot"
        );

        return success({
            result:
                await restartBotRuntime(
                    input
                )
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


export async function botShutdownTool(
    input = {}
) {
    try {
        requireConfirmation(
            input,
            "shutdown the bot"
        );

        return success({
            result:
                await shutdownBotRuntime(
                    input
                )
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// PROJECT / PACKAGE HELPERS
// =====================================================

function getPackageJson() {
    const packagePath =
        path.join(
            PROJECT_ROOT,
            "package.json"
        );

    if (
        !isRegularFile(
            packagePath
        )
    ) {
        return {};
    }

    try {
        return JSON.parse(
            readUtf8File(
                packagePath,
                1000000
            )
        );
    } catch {
        return {};
    }
}


function getLockfileInfo() {
    return {
        packageLock:
            isRegularFile(
                path.join(
                    PROJECT_ROOT,
                    "package-lock.json"
                )
            ),

        npmShrinkwrap:
            isRegularFile(
                path.join(
                    PROJECT_ROOT,
                    "npm-shrinkwrap.json"
                )
            ),

        yarnLock:
            isRegularFile(
                path.join(
                    PROJECT_ROOT,
                    "yarn.lock"
                )
            ),

        pnpmLock:
            isRegularFile(
                path.join(
                    PROJECT_ROOT,
                    "pnpm-lock.yaml"
                )
            )
    };
}


function summarizeDependency(
    name,
    requestedVersion
) {
    let installed =
        false;

    let installedVersion =
        null;

    let packagePath =
        null;

    try {
        const resolved =
            require.resolve(
                `${name}/package.json`,
                {
                    paths: [
                        PROJECT_ROOT
                    ]
                }
            );

        packagePath =
            resolved;

        const packageInfo =
            JSON.parse(
                fs.readFileSync(
                    resolved,
                    "utf8"
                )
            );

        installed =
            true;

        installedVersion =
            packageInfo.version ||
            null;
    } catch {
        installed =
            false;
    }

    return {
        name,
        requested:
            requestedVersion,
        installed,
        installedVersion,
        packagePath:
            packagePath
                ? relativePath(
                    packagePath
                )
                : null
    };
}


function formatDuration(
    seconds
) {
    const total =
        Math.max(
            0,
            Math.floor(
                Number(
                    seconds
                ) || 0
            )
        );

    const days =
        Math.floor(
            total /
            86400
        );

    const hours =
        Math.floor(
            (
                total %
                86400
            ) /
            3600
        );

    const minutes =
        Math.floor(
            (
                total %
                3600
            ) /
            60
        );

    const secs =
        total %
        60;

    return [
        days
            ? `${days}d`
            : null,

        hours
            ? `${hours}h`
            : null,

        minutes
            ? `${minutes}m`
            : null,

        `${secs}s`
    ]
        .filter(
            Boolean
        )
        .join(
            " "
        );
}
// =====================================================
// TOOL 25 — PROJECT SEARCH
// =====================================================

export async function projectSearchTool(
    input = {}
) {
    try {
        const query =
            safeText(
                input.query ||
                input.search ||
                input.text
            );

        if (!query) {
            throw new Error(
                "Search query is required."
            );
        }

        const caseSensitive =
            input.caseSensitive === true;

        const extensions =
            Array.isArray(
                input.extensions
            )
                ? new Set(
                    input.extensions.map(
                        ext =>
                            String(
                                ext
                            ).startsWith(".")
                                ? String(
                                    ext
                                ).toLowerCase()
                                : `.${String(
                                    ext
                                ).toLowerCase()}`
                    )
                )
                : SEARCH_EXTENSIONS;

        const files =
            walkFiles(
                PROJECT_ROOT,
                {
                    maxFiles:
                        MAX_SCAN_FILES,
                    extensions
                }
            );

        const matches = [];

        const needle =
            caseSensitive
                ? query
                : query.toLowerCase();

        for (
            const file of files
        ) {
            if (
                matches.length >=
                MAX_SEARCH_MATCHES
            ) {
                break;
            }

            let content;

            try {
                content =
                    readUtf8File(
                        file,
                        MAX_TEXT_SCAN_BYTES
                    );
            } catch {
                continue;
            }

            const haystack =
                caseSensitive
                    ? content
                    : content.toLowerCase();

            let offset =
                0;

            while (
                offset <
                    haystack.length &&
                matches.length <
                    MAX_SEARCH_MATCHES
            ) {
                const index =
                    haystack.indexOf(
                        needle,
                        offset
                    );

                if (
                    index === -1
                ) {
                    break;
                }

                const before =
                    haystack.slice(
                        0,
                        index
                    );

                const line =
                    before.split(
                        "\n"
                    ).length;

                const lineStart =
                    before.lastIndexOf(
                        "\n"
                    ) + 1;

                const lineEnd =
                    haystack.indexOf(
                        "\n",
                        index
                    );

                const actualEnd =
                    lineEnd === -1
                        ? content.length
                        : lineEnd;

                matches.push({
                    path:
                        relativePath(
                            file
                        ),
                    line,
                    text:
                        content.slice(
                            lineStart,
                            actualEnd
                        ).trim()
                });

                offset =
                    index +
                    Math.max(
                        needle.length,
                        1
                    );
            }
        }

        return success({
            query,
            filesScanned:
                files.length,
            matches,
            count:
                matches.length,
            truncated:
                matches.length >=
                MAX_SEARCH_MATCHES
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 26 — PROJECT MAP
// =====================================================

export async function projectMapTool(
    input = {}
) {
    try {
        const entries =
            listDirectoryEntries(
                PROJECT_ROOT,
                {
                    recursive:
                        input.recursive !==
                        false,

                    maxEntries:
                        input.maxEntries ||
                        MAX_PROJECT_MAP_ENTRIES
                }
            );

        const files =
            entries.filter(
                entry =>
                    entry.type ===
                    "file"
            );

        const directories =
            entries.filter(
                entry =>
                    entry.type ===
                    "directory"
            );

        const extensionCounts = {};

        for (
            const item of files
        ) {
            const ext =
                path.extname(
                    item.path
                ).toLowerCase() ||
                "[no extension]";

            extensionCounts[
                ext
            ] =
                (
                    extensionCounts[
                        ext
                    ] ||
                    0
                ) + 1;
        }

        return success({
            root:
                PROJECT_ROOT,

            entries,

            files:
                files.length,

            directories:
                directories.length,

            extensionCounts,

            truncated:
                entries.length >=
                (
                    input.maxEntries ||
                    MAX_PROJECT_MAP_ENTRIES
                )
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 27 — FIND REFERENCES
// =====================================================

export async function findReferencesTool(
    input = {}
) {
    try {
        const symbol =
            safeText(
                input.symbol ||
                input.name ||
                input.query
            );

        if (!symbol) {
            throw new Error(
                "Symbol or reference text is required."
            );
        }

        const result =
            await projectSearchTool({
                query:
                    symbol,

                caseSensitive:
                    input.caseSensitive === true,

                extensions:
                    input.extensions ||
                    [
                        ".js",
                        ".mjs",
                        ".cjs"
                    ]
            });

        if (
            !result.ok
        ) {
            return result;
        }

        return success({
            symbol,
            references:
                result.matches,

            count:
                result.count,

            filesScanned:
                result.filesScanned,

            truncated:
                result.truncated
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 28 — ERROR DIAGNOSE
// =====================================================

function extractErrorLocation(
    text
) {
    const source =
        String(
            text || ""
        );

    const patterns = [
        /(?:file:\/\/)?(.+?):(\d+):(\d+)/,
        /at\s+(?:file:\/\/)?(.+?):(\d+):(\d+)/,
        /\((?:file:\/\/)?(.+?):(\d+):(\d+)\)/
    ];

    for (
        const pattern of patterns
    ) {
        const match =
            source.match(
                pattern
            );

        if (
            match
        ) {
            return {
                path:
                    match[1],
                line:
                    Number(
                        match[2]
                    ),
                column:
                    Number(
                        match[3]
                    )
            };
        }
    }

    return null;
}


function classifyError(
    text
) {
    const message =
        String(
            text || ""
        ).toLowerCase();

    if (
        message.includes(
            "syntaxerror"
        ) ||
        message.includes(
            "unexpected token"
        ) ||
        message.includes(
            "unexpected identifier"
        ) ||
        message.includes(
            "missing )"
        ) ||
        message.includes(
            "missing }"
        )
    ) {
        return "syntax";
    }

    if (
        message.includes(
            "cannot find module"
        ) ||
        message.includes(
            "err_module_not_found"
        ) ||
        message.includes(
            "module not found"
        )
    ) {
        return "module";
    }

    if (
        message.includes(
            "eaddrinuse"
        ) ||
        message.includes(
            "econnrefused"
        ) ||
        message.includes(
            "enotfound"
        ) ||
        message.includes(
            "network"
        )
    ) {
        return "network";
    }

    if (
        message.includes(
            "mongo"
        ) ||
        message.includes(
            "mongoose"
        ) ||
        message.includes(
            "mongodb"
        )
    ) {
        return "database";
    }

    if (
        message.includes(
            "permission denied"
        ) ||
        message.includes(
            "access denied"
        ) ||
        message.includes(
            "eperm"
        )
    ) {
        return "permission";
    }

    if (
        message.includes(
            "enoent"
        )
    ) {
        return "missing_file";
    }

    if (
        message.includes(
            "timeout"
        )
    ) {
        return "timeout";
    }

    return "runtime";
}


export async function errorDiagnoseTool(
    input = {}
) {
    try {
        const text =
            String(
                input.error ||
                input.message ||
                input.log ||
                ""
            );

        if (!text.trim()) {
            throw new Error(
                "Error text is required."
            );
        }

        const location =
            extractErrorLocation(
                text
            );

        const category =
            classifyError(
                text
            );

        let fileContext =
            null;

        if (
            location?.path
        ) {
            try {
                const absolute =
                    path.isAbsolute(
                        location.path
                    )
                        ? location.path
                        : resolveProjectFile(
                            location.path
                        );

                if (
                    isInsideProject(
                        absolute
                    ) &&
                    isRegularFile(
                        absolute
                    )
                ) {
                    const content =
                        readUtf8File(
                            absolute,
                            MAX_TEXT_SCAN_BYTES
                        );

                    const lines =
                        content.split(
                            "\n"
                        );

                    const lineIndex =
                        Math.max(
                            0,
                            (
                                location.line ||
                                1
                            ) - 1
                        );

                    const start =
                        Math.max(
                            0,
                            lineIndex -
                                3
                        );

                    const end =
                        Math.min(
                            lines.length,
                            lineIndex +
                                4
                        );

                    fileContext = {
                        path:
                            relativePath(
                                absolute
                            ),
                        line:
                            location.line,
                        column:
                            location.column,
                        context:
                            lines.slice(
                                start,
                                end
                            )
                    };
                }
            } catch {
                fileContext =
                    null;
            }
        }

        return success({
            category,
            location,
            fileContext,
            message:
                limitText(
                    text,
                    MAX_OUTPUT_LENGTH
                ),

            recommendations:
                getErrorRecommendations(
                    category
                )
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


function getErrorRecommendations(
    category
) {
    const recommendations = {
        syntax: [
            "Run syntaxTest on the affected JavaScript file.",
            "Inspect the reported line and nearby braces, parentheses, imports, and exports.",
            "Check for duplicate declarations after automated edits."
        ],

        module: [
            "Run checkDependencies.",
            "Inspect package.json and the failing import path.",
            "Verify that the dependency is actually installed."
        ],

        database: [
            "Check MongoDB connection status.",
            "Inspect the relevant database helper and collection.",
            "Avoid destructive database operations until the failure is understood."
        ],

        network: [
            "Check connection/network state.",
            "Inspect the socket or external service configuration.",
            "Retry only after confirming the underlying endpoint is available."
        ],

        permission: [
            "Check filesystem permissions.",
            "Confirm the operation is allowed for the current runtime.",
            "Do not bypass protected-path restrictions."
        ],

        missing_file: [
            "Verify the expected path.",
            "Use projectSearch or projectMap to locate the actual file.",
            "Check whether a previous edit or deployment removed the file."
        ],

        timeout: [
            "Inspect logs around the timeout.",
            "Check whether the operation is doing excessive filesystem or network work.",
            "Retry with a controlled timeout rather than an unrestricted process."
        ],

        runtime: [
            "Inspect the complete stack trace.",
            "Use findReferences and projectSearch to trace the affected code path.",
            "Run the smallest relevant test before making a repair."
        ]
    };

    return (
        recommendations[
            category
        ] ||
        recommendations.runtime
    );
}


// =====================================================
// TOOL 29 — TEST SUITE
// =====================================================

function isTestFile(
    filePath
) {
    const name =
        path.basename(
            filePath
        );

    return TEST_NAME_PATTERNS.some(
        pattern =>
            pattern.test(
                name
            )
    );
}


export async function testSuiteTool(
    input = {}
) {
    try {
        const requested =
            safeText(
                input.path
            );

        let testRoot =
            requested
                ? resolveProjectFile(
                    requested
                )
                : TESTS_PATH;

        let testFiles = [];

        if (
            isRegularFile(
                testRoot
            )
        ) {
            testFiles = [
                testRoot
            ];
        } else if (
            isRegularDirectory(
                testRoot
            )
        ) {
            testFiles =
                walkFiles(
                    testRoot,
                    {
                        maxFiles:
                            input.maxFiles ||
                            MAX_TEST_FILES,
                        extensions:
                            new Set([
                                ".js",
                                ".mjs",
                                ".cjs"
                            ])
                    }
                )
                .filter(
                    isTestFile
                );
        } else {
            testFiles =
                walkFiles(
                    PROJECT_ROOT,
                    {
                        maxFiles:
                            input.maxFiles ||
                            MAX_TEST_FILES,
                        extensions:
                            new Set([
                                ".js",
                                ".mjs",
                                ".cjs"
                            ])
                    }
                )
                .filter(
                    isTestFile
                );
        }

        const results = [];

        for (
            const file of testFiles
        ) {
            try {
                const output =
                    await execFileAsync(
                        process.execPath,
                        [
                            file
                        ],
                        {
                            cwd:
                                PROJECT_ROOT,

                            timeout:
                                input.timeout ||
                                TEST_SUITE_TIMEOUT,

                            maxBuffer:
                                2 *
                                1024 *
                                1024
                        }
                    );

                results.push({
                    path:
                        relativePath(
                            file
                        ),
                    passed:
                        true,
                    exitCode:
                        0,
                    stdout:
                        limitText(
                            output.stdout,
                            MAX_OUTPUT_LENGTH * 2
                        ),
                    stderr:
                        limitText(
                            output.stderr,
                            MAX_OUTPUT_LENGTH * 2
                        )
                });
            } catch (
                error
            ) {
                results.push({
                    path:
                        relativePath(
                            file
                        ),
                    passed:
                        false,
                    exitCode:
                        error.code ??
                        null,
                    stdout:
                        limitText(
                            error.stdout,
                            MAX_OUTPUT_LENGTH * 2
                        ),
                    stderr:
                        limitText(
                            error.stderr,
                            MAX_OUTPUT_LENGTH * 2
                        ),
                    error:
                        limitText(
                            error.message
                        )
                });
            }
        }

        return success({
            root:
                relativePath(
                    testRoot
                ),

            total:
                results.length,

            passed:
                results.filter(
                    item =>
                        item.passed
                ).length,

            failed:
                results.filter(
                    item =>
                        !item.passed
                ).length,

            results
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 30 — COMMAND SEARCH
// =====================================================

export async function commandSearchTool(
    input = {}
) {
    try {
        const query =
            safeText(
                input.query ||
                input.search ||
                input.name
            ).toLowerCase();

        const commands =
            commandNames();

        const matches =
            query
                ? commands.filter(
                    command =>
                        command
                            .toLowerCase()
                            .includes(
                                query
                            )
                )
                : commands;

        return success({
            query,
            commands:
                matches,
            count:
                matches.length
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 31 — FILE DIFF
// =====================================================

function createLineDiff(
    oldText,
    newText
) {
    const oldLines =
        String(
            oldText
        ).split(
            "\n"
        );

    const newLines =
        String(
            newText
        ).split(
            "\n"
        );

    const matrix =
        Array.from(
            {
                length:
                    oldLines.length + 1
            },
            () =>
                Array(
                    newLines.length + 1
                ).fill(
                    0
                )
        );

    for (
        let i = 1;
        i <= oldLines.length;
        i++
    ) {
        for (
            let j = 1;
            j <= newLines.length;
            j++
        ) {
            if (
                oldLines[
                    i - 1
                ] ===
                newLines[
                    j - 1
                ]
            ) {
                matrix[i][j] =
                    matrix[
                        i - 1
                    ][
                        j - 1
                    ] + 1;
            } else {
                matrix[i][j] =
                    Math.max(
                        matrix[
                            i - 1
                        ][j],

                        matrix[i][
                            j - 1
                        ]
                    );
            }
        }
    }

    const diff = [];

    let i =
        oldLines.length;

    let j =
        newLines.length;

    while (
        i > 0 ||
        j > 0
    ) {
        if (
            i > 0 &&
            j > 0 &&
            oldLines[
                i - 1
            ] ===
            newLines[
                j - 1
            ]
        ) {
            diff.push({
                type:
                    "same",
                line:
                    oldLines[
                        i - 1
                    ]
            });

            i--;
            j--;

            continue;
        }

        if (
            j > 0 &&
            (
                i === 0 ||
                matrix[i][
                    j - 1
                ] >=
                matrix[
                    i - 1
                ][j]
            )
        ) {
            diff.push({
                type:
                    "added",
                line:
                    newLines[
                        j - 1
                    ]
            });

            j--;

            continue;
        }

        if (
            i > 0
        ) {
            diff.push({
                type:
                    "removed",
                line:
                    oldLines[
                        i - 1
                    ]
            });

            i--;
        }
    }

    diff.reverse();

    return diff;
}


export async function fileDiffTool(
    input = {}
) {
    try {
        const filePath =
            normalizeProjectRelative(
                input.path ||
                input.file ||
                input.filePath
            );

        const target =
            resolveProjectFile(
                filePath
            );

        if (
            !isRegularFile(
                target
            )
        ) {
            throw new Error(
                "Target file does not exist."
            );
        }

        const current =
            readUtf8File(
                target,
                MAX_TEXT_SCAN_BYTES
            );

        let comparison =
            input.content;

        if (
            comparison ===
            undefined
        ) {
            const backup =
                safeText(
                    input.backup ||
                    input.backupPath
                );

            if (
                !backup
            ) {
                throw new Error(
                    "Provide comparison content or a backup path."
                );
            }

            comparison =
                readUtf8File(
                    resolveProjectFile(
                        backup
                    ),
                    MAX_TEXT_SCAN_BYTES
                );
        }

        const diff =
            createLineDiff(
                current,
                comparison
            );

        const limited =
            diff.slice(
                0,
                input.maxLines ||
                    MAX_DIFF_LINES
            );

        return success({
            path:
                filePath,

            added:
                diff.filter(
                    item =>
                        item.type ===
                        "added"
                ).length,

            removed:
                diff.filter(
                    item =>
                        item.type ===
                        "removed"
                ).length,

            unchanged:
                diff.filter(
                    item =>
                        item.type ===
                        "same"
                ).length,

            truncated:
                diff.length >
                (
                    input.maxLines ||
                    MAX_DIFF_LINES
                ),

            diff:
                limited
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}
// =====================================================
// TOOL 33 — REPAIR PLAN
// =====================================================

export async function repairPlanTool(
    input = {}
) {
    try {
        const errorText =
            safeText(
                input.error ||
                input.message ||
                input.log
            );

        const requestedPath =
            safeText(
                input.path ||
                input.file ||
                input.filePath
            );

        let diagnosis = null;

        if (
            errorText
        ) {
            diagnosis =
                await errorDiagnoseTool({
                    error:
                        errorText
                });
        }

        let targetPath =
            requestedPath ||
            diagnosis?.location?.path ||
            null;

        if (
            targetPath
        ) {
            try {
                targetPath =
                    normalizeProjectRelative(
                        targetPath
                    );
            } catch {
                targetPath =
                    null;
            }
        }

        const steps = [];

        if (
            diagnosis?.category ===
            "syntax"
        ) {
            steps.push(
                "Inspect the exact syntax-error location.",
                "Read the affected file before editing.",
                "Check surrounding braces, parentheses, imports, exports, and duplicate declarations.",
                "Apply the smallest safe repair.",
                "Run syntaxTest after the edit."
            );
        } else if (
            diagnosis?.category ===
            "module"
        ) {
            steps.push(
                "Inspect the failing import.",
                "Check installed dependencies.",
                "Verify package.json dependency declarations.",
                "Confirm the imported path exists.",
                "Run syntaxTest and the relevant test."
            );
        } else if (
            diagnosis?.category ===
            "database"
        ) {
            steps.push(
                "Inspect the database error and affected helper.",
                "Check MongoDB connection state.",
                "Verify the collection/document shape.",
                "Avoid destructive database changes until the cause is confirmed."
            );
        } else if (
            diagnosis?.category ===
            "network"
        ) {
            steps.push(
                "Inspect the connection/socket logs.",
                "Verify network availability.",
                "Check the relevant endpoint configuration.",
                "Retry through the normal runtime path."
            );
        } else {
            steps.push(
                "Inspect the reported error.",
                "Locate the affected file and references.",
                "Read the relevant source before changing it.",
                "Create a minimal repair.",
                "Run syntax and relevant tests.",
                "Verify the final runtime state."
            );
        }

        if (
            targetPath
        ) {
            steps.unshift(
                `Target file: ${targetPath}`
            );
        }

        return success({
            targetPath,
            diagnosis,
            steps,
            requiresVerification:
                true
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 34 — VERIFY REPAIR
// =====================================================

export async function verifyRepairTool(
    input = {}
) {
    try {
        const requestedPath =
            safeText(
                input.path ||
                input.file ||
                input.filePath
            );

        if (
            !requestedPath
        ) {
            throw new Error(
                "A repaired file path is required."
            );
        }

        const filePath =
            normalizeProjectRelative(
                requestedPath
            );

        const syntax =
            await syntaxTestTool({
                path:
                    filePath
            });

        const checks = {
            syntax
        };

        if (
            input.runTest ||
            input.test
        ) {
            checks.test =
                await runTestTool({
                    path:
                        input.test
                });
        }

        const passed =
            syntax.ok &&
            (
                !checks.test ||
                checks.test.ok
            );

        return success({
            path:
                filePath,

            passed,

            checks
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// PROJECT HEALTH HELPERS
// =====================================================

function getProjectHealthFiles() {
    const files =
        walkFiles(
            PROJECT_ROOT,
            {
                maxFiles:
                    MAX_SCAN_FILES,
                extensions:
                    CODE_EXTENSIONS
            }
        );

    return files;
}


function countSyntaxErrors(
    files
) {
    let errors = 0;
    const details = [];

    for (
        const file of files
    ) {
        try {
            const source =
                readUtf8File(
                    file,
                    MAX_TEXT_SCAN_BYTES
                );

            const tempName =
                path.join(
                    PROJECT_ROOT,
                    `.bix-syntax-${process.pid}-${Date.now()}.mjs`
                );

            try {
                fs.writeFileSync(
                    tempName,
                    source,
                    "utf8"
                );

                require.resolve(
                    tempName
                );
            } catch {
                // Static require resolution is not a syntax parser.
            } finally {
                try {
                    fs.unlinkSync(
                        tempName
                    );
                } catch {
                    // Ignore temporary cleanup failure.
                }
            }
        } catch {
            errors++;
        }
    }

    return {
        errors,
        details
    };
}


// =====================================================
// TOOL 35 — PROJECT HEALTH
// =====================================================

export async function projectHealthTool(
    input = {}
) {
    try {
        const packageJson =
            getPackageJson();

        const files =
            getProjectHealthFiles();

        const criticalFiles = [
            "index.js",
            "events/message.js",
            "lib/socket.js",
            "lib/db.js",
            "lib/botRuntime.js",
            "lib/bixTools.js",
            "lib/bixAI.js"
        ];

        const missingCritical =
            criticalFiles.filter(
                file =>
                    !isRegularFile(
                        resolveProjectFile(
                            file
                        )
                    )
            );

        const dependencyCheck =
            await checkDependenciesTool();

        const commandList =
            commandNames();

        const gitPath =
            path.join(
                PROJECT_ROOT,
                ".git"
            );

        const sessionPath =
            path.join(
                PROJECT_ROOT,
                "session"
            );

        const databasePath =
            path.join(
                PROJECT_ROOT,
                "database"
            );

        return success({
            projectRoot:
                PROJECT_ROOT,

            package:
                {
                    name:
                        packageJson.name ||
                        null,

                    version:
                        packageJson.version ||
                        null
                },

            codeFiles:
                files.length,

            commands:
                commandList.length,

            missingCritical,

            criticalFilesHealthy:
                missingCritical.length ===
                0,

            dependencyCheck,

            infrastructure:
                {
                    git:
                        isRegularDirectory(
                            gitPath
                        ),

                    session:
                        isRegularDirectory(
                            sessionPath
                        ),

                    database:
                        isRegularDirectory(
                            databasePath
                        ),

                    logs:
                        isRegularDirectory(
                            LOG_PATH
                        )
                },

            process:
                {
                    pid:
                        process.pid,

                    node:
                        process.version,

                    platform:
                        process.platform,

                    arch:
                        process.arch
                }
        });
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 36 — TASK MEMORY
// =====================================================

const TASK_MEMORY_COLLECTION =
    "bix_task_memory";


async function readTaskMemory(
    taskId
) {
    return (
        await getDoc(
            TASK_MEMORY_COLLECTION,
            taskId
        )
    ) || {
        taskId,
        createdAt:
            nowIso(),
        updates: []
    };
}


async function saveTaskMemory(
    taskId,
    memory
) {
    return await setDoc(
        TASK_MEMORY_COLLECTION,
        taskId,
        memory
    );
}


export async function taskMemoryTool(
    input = {}
) {
    try {
        const taskId =
            safeText(
                input.taskId ||
                input.id ||
                input.task
            );

        if (!taskId) {
            throw new Error(
                "taskId is required."
            );
        }

        const action =
            safeText(
                input.action ||
                "read"
            ).toLowerCase();

        if (
            action ===
            "read"
        ) {
            const memory =
                await readTaskMemory(
                    taskId
                );

            return success({
                taskId,
                memory
            });
        }

        if (
            action ===
            "clear"
        ) {
            requireConfirmation(
                input,
                "clear task memory"
            );

            await deleteDoc(
                TASK_MEMORY_COLLECTION,
                taskId
            );

            return success({
                taskId,
                cleared:
                    true
            });
        }

        const memory =
            await readTaskMemory(
                taskId
            );

        if (
            action ===
            "create"
        ) {
            const created = {
                ...memory,
                taskId,
                title:
                    safeText(
                        input.title
                    ) ||
                    memory.title ||
                    taskId,
                status:
                    safeText(
                        input.status
                    ) ||
                    memory.status ||
                    "active",
                createdAt:
                    memory.createdAt ||
                    nowIso(),
                updatedAt:
                    nowIso(),
                updates:
                    normalizeMemoryEntries(
                        memory.updates
                    )
            };

            if (
                input.note
            ) {
                created.updates =
                    normalizeMemoryEntries([
                        ...created.updates,
                        {
                            type:
                                "note",
                            text:
                                String(
                                    input.note
                                ).slice(
                                    0,
                                    MAX_MEMORY_ITEM_LENGTH
                                ),
                            timestamp:
                                nowIso()
                        }
                    ]);
            }

            await saveTaskMemory(
                taskId,
                created
            );

            return success({
                taskId,
                memory:
                    created
            });
        }

        if (
            action ===
            "update"
        ) {
            const updates =
                normalizeMemoryEntries(
                    memory.updates
                );

            if (
                input.note
            ) {
                updates.push({
                    type:
                        "note",
                    text:
                        String(
                            input.note
                        ).slice(
                            0,
                            MAX_MEMORY_ITEM_LENGTH
                        ),
                    timestamp:
                        nowIso()
                });
            }

            if (
                input.status
            ) {
                updates.push({
                    type:
                        "status",
                    status:
                        String(
                            input.status
                        ),
                    timestamp:
                        nowIso()
                });
            }

            const updated = {
                ...memory,
                ...(input.title
                    ? {
                        title:
                            String(
                                input.title
                            ).slice(
                                0,
                                MAX_MEMORY_ITEM_LENGTH
                            )
                    }
                    : {}),
                ...(input.status
                    ? {
                        status:
                            String(
                                input.status
                            )
                    }
                    : {}),
                updates:
                    normalizeMemoryEntries(
                        updates
                    ),
                updatedAt:
                    nowIso()
            };

            await saveTaskMemory(
                taskId,
                updated
            );

            return success({
                taskId,
                memory:
                    updated
            });
        }

        throw new Error(
            "Unsupported taskMemory action. Use read, create, update, or clear."
        );
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// BIX CONTROL HELPERS
// =====================================================

const CONTROL_COLLECTION =
    "bix_settings";


async function getControlState(
    key,
    fallback = {}
) {
    const doc =
        await getDoc(
            CONTROL_COLLECTION,
            key
        );

    if (
        !doc
    ) {
        return cloneJson(
            fallback
        );
    }

    return doc;
}


async function setControlState(
    key,
    value
) {
    return await setDoc(
        CONTROL_COLLECTION,
        key,
        value
    );
}


function normalizeControlAction(
    action
) {
    return safeText(
        action
    )
        .toLowerCase()
        .replace(
            /[\s-]+/g,
            "_"
        );
}


function requireObject(
    value,
    name
) {
    if (
        !value ||
        typeof value !==
            "object" ||
        Array.isArray(
            value
        )
    ) {
        throw new Error(
            `${name} must be an object.`
        );
    }

    return value;
}


// =====================================================
// TOOL 37 — COMMAND CONTROL
// =====================================================

export async function commandControlTool(
    input = {}
) {
    try {
        const action =
            normalizeControlAction(
                input.action ||
                "list"
            );

        if (
            action ===
            "list"
        ) {
            return await listCommandsTool();
        }

        const commandName =
            validateCommandName(
                input.name ||
                input.command
            );

        const filePath =
            commandPathFromName(
                commandName
            );

        if (
            action ===
            "inspect"
        ) {
            return await inspectCommandTool({
                name:
                    commandName
            });
        }

        if (
            action ===
            "enable"
        ) {
            const disabledPath =
                `${filePath}.disabled`;

            if (
                isRegularFile(
                    disabledPath
                )
            ) {
                fs.renameSync(
                    disabledPath,
                    filePath
                );
            }

            return success({
                command:
                    commandName,
                enabled:
                    true
            });
        }

        if (
            action ===
            "disable"
        ) {
            requireConfirmation(
                input,
                "disable this command"
            );

            if (
                !isRegularFile(
                    filePath
                )
            ) {
                throw new Error(
                    `Command does not exist: ${commandName}`
                );
            }

            const disabledPath =
                `${filePath}.disabled`;

            if (
                isRegularFile(
                    disabledPath
                )
            ) {
                throw new Error(
                    `Command is already disabled: ${commandName}`
                );
            }

            fs.renameSync(
                filePath,
                disabledPath
            );

            return success({
                command:
                    commandName,
                enabled:
                    false
            });
        }

        if (
            action ===
            "create"
        ) {
            return await createCommandTool(
                input
            );
        }

        if (
            action ===
            "edit"
        ) {
            return await editCommandTool(
                input
            );
        }

        if (
            action ===
            "delete"
        ) {
            return await deleteCommandTool(
                input
            );
        }

        throw new Error(
            "Unsupported commandControl action."
        );
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 38 — SETTINGS CONTROL
// =====================================================

export async function settingsControlTool(
    input = {}
) {
    try {
        const key =
            safeText(
                input.key ||
                input.name ||
                "global"
            );

        const action =
            normalizeControlAction(
                input.action ||
                "get"
            );

        if (
            action ===
            "get"
        ) {
            const settings =
                await getControlState(
                    `settings:${key}`,
                    {}
                );

            return success({
                key,
                settings
            });
        }

        if (
            action ===
            "set"
        ) {
            const value =
                requireObject(
                    input.value ||
                    input.settings ||
                    {},
                    "settings"
                );

            const current =
                await getControlState(
                    `settings:${key}`,
                    {}
                );

            const updated = {
                ...current,
                ...value,
                updatedAt:
                    nowIso()
            };

            await setControlState(
                `settings:${key}`,
                updated
            );

            return success({
                key,
                settings:
                    updated,
                restartRequired:
                    input.restartRequired !==
                    false
            });
        }

        if (
            action ===
            "delete"
        ) {
            requireConfirmation(
                input,
                "delete these settings"
            );

            await deleteDoc(
                CONTROL_COLLECTION,
                `settings:${key}`
            );

            return success({
                key,
                deleted:
                    true
            });
        }

        throw new Error(
            "Unsupported settingsControl action."
        );
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// GROUP HELPERS
// =====================================================

function requireGroupJid(
    input
) {
    const jid =
        validateJid(
            input.groupJid ||
            input.jid ||
            input.group
        );

    if (
        !jid.endsWith(
            "@g.us"
        )
    ) {
        throw new Error(
            "A WhatsApp group JID ending with @g.us is required."
        );
    }

    return jid;
}


function requireSocket() {
    const socket =
        resolveBixSocket();

    if (
        !socket
    ) {
        throw new Error(
            "Live Baileys socket is not available."
        );
    }

    return socket;
}


function normalizeParticipantList(
    input
) {
    const values =
        normalizeArray(
            input.participants ||
            input.users ||
            input.jids
        );

    if (
        !values.length
    ) {
        throw new Error(
            "At least one participant JID is required."
        );
    }

    return values.map(
        validateJid
    );
}


// =====================================================
// TOOL 39 — GROUP CONTROL
// =====================================================

export async function groupControlTool(
    input = {}
) {
    try {
        const action =
            normalizeControlAction(
                input.action ||
                "info"
            );

        const jid =
            requireGroupJid(
                input
            );

        const socket =
            requireSocket();

        if (
            action ===
            "info"
        ) {
            const metadata =
                await socket.groupMetadata(
                    jid
                );

            return success({
                groupJid:
                    jid,
                metadata
            });
        }

        if (
            action ===
            "participants_add" ||
            action ===
            "add"
        ) {
            const participants =
                normalizeParticipantList(
                    input
                );

            return success({
                groupJid:
                    jid,
                action:
                    "add",
                result:
                    await socket.groupParticipantsUpdate(
                        jid,
                        participants,
                        "add"
                    )
            });
        }

        if (
            action ===
            "participants_remove" ||
            action ===
            "remove"
        ) {
            requireConfirmation(
                input,
                "remove group participants"
            );

            const participants =
                normalizeParticipantList(
                    input
                );

            return success({
                groupJid:
                    jid,
                action:
                    "remove",
                result:
                    await socket.groupParticipantsUpdate(
                        jid,
                        participants,
                        "remove"
                    )
            });
        }

        if (
            action ===
            "promote"
        ) {
            requireConfirmation(
                input,
                "promote group participants"
            );

            const participants =
                normalizeParticipantList(
                    input
                );

            return success({
                groupJid:
                    jid,
                action:
                    "promote",
                result:
                    await socket.groupParticipantsUpdate(
                        jid,
                        participants,
                        "promote"
                    )
            });
        }

        if (
            action ===
            "demote"
        ) {
            requireConfirmation(
                input,
                "demote group participants"
            );

            const participants =
                normalizeParticipantList(
                    input
                );

            return success({
                groupJid:
                    jid,
                action:
                    "demote",
                result:
                    await socket.groupParticipantsUpdate(
                        jid,
                        participants,
                        "demote"
                    )
            });
        }

        if (
            action ===
            "subject"
        ) {
            const subject =
                safeText(
                    input.subject ||
                    input.name
                );

            if (!subject) {
                throw new Error(
                    "Group subject is required."
                );
            }

            return success({
                groupJid:
                    jid,
                result:
                    await socket.groupUpdateSubject(
                        jid,
                        subject
                    )
            });
        }

        if (
            action ===
            "description"
        ) {
            const description =
                String(
                    input.description ??
                    ""
                );

            return success({
                groupJid:
                    jid,
                result:
                    await socket.groupUpdateDescription(
                        jid,
                        description
                    )
            });
        }

        if (
            action ===
            "settings"
        ) {
            const setting =
                safeText(
                    input.setting ||
                    input.value
                );

            if (
                !setting
            ) {
                throw new Error(
                    "Group setting is required."
                );
            }

            return success({
                groupJid:
                    jid,
                setting,
                result:
                    await socket.groupSettingUpdate(
                        jid,
                        setting
                    )
            });
        }

        if (
            action ===
            "invite_code"
        ) {
            return success({
                groupJid:
                    jid,
                inviteCode:
                    await socket.groupInviteCode(
                        jid
                    )
            });
        }

        if (
            action ===
            "revoke_invite"
        ) {
            requireConfirmation(
                input,
                "revoke the group invite"
            );

            return success({
                groupJid:
                    jid,
                inviteCode:
                    await socket.groupRevokeInvite(
                        jid
                    )
            });
        }

        if (
            action ===
            "ephemeral"
        ) {
            const expiration =
                Number(
                    input.expiration ??
                    input.seconds ??
                    0
                );

            return success({
                groupJid:
                    jid,
                expiration,
                result:
                    await socket.groupToggleEphemeral(
                        jid,
                        expiration
                    )
            });
        }

        if (
            action ===
            "member_add_mode"
        ) {
            const mode =
                normalizeBoolean(
                    input.enabled,
                    false
                );

            return success({
                groupJid:
                    jid,
                enabled:
                    mode,
                result:
                    await socket.groupMemberAddMode(
                        jid,
                        mode
                    )
            });
        }

        if (
            action ===
            "leave"
        ) {
            requireConfirmation(
                input,
                "leave the group"
            );

            return success({
                groupJid:
                    jid,
                result:
                    await socket.groupLeave(
                        jid
                    )
            });
        }

        throw new Error(
            "Unsupported groupControl action."
        );
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}


// =====================================================
// TOOL 40 — GROUP SETTINGS CONTROL
// =====================================================

export async function groupSettingsControlTool(
    input = {}
) {
    try {
        const jid =
            requireGroupJid(
                input
            );

        const action =
            normalizeControlAction(
                input.action ||
                "get"
            );

        const socket =
            requireSocket();

        if (
            action ===
            "get"
        ) {
            const metadata =
                await socket.groupMetadata(
                    jid
                );

            return success({
                groupJid:
                    jid,
                settings:
                    {
                        announce:
                            metadata.announce,
                        restrict:
                            metadata.restrict,
                        memberAddMode:
                            metadata.memberAddMode,
                        ephemeralDuration:
                            metadata.ephemeralDuration
                    }
            });
        }

        if (
            action ===
            "setting"
        ) {
            const setting =
                safeText(
                    input.setting ||
                    input.value
                );

            if (!setting) {
                throw new Error(
                    "Group setting is required."
                );
            }

            return success({
                groupJid:
                    jid,
                result:
                    await socket.groupSettingUpdate(
                        jid,
                        setting
                    )
            });
        }

        if (
            action ===
            "ephemeral"
        ) {
            const expiration =
                Number(
                    input.expiration ??
                    input.seconds ??
                    0
                );

            return success({
                groupJid:
                    jid,
                result:
                    await socket.groupToggleEphemeral(
                        jid,
                        expiration
                    )
            });
        }

        if (
            action ===
            "member_add_mode"
        ) {
            const enabled =
                normalizeBoolean(
                    input.enabled,
                    false
                );

            return success({
                groupJid:
                    jid,
                result:
                    await socket.groupMemberAddMode(
                        jid,
                        enabled
                    )
            });
        }

        throw new Error(
            "Unsupported groupSettingsControl action."
        );
    } catch (
        error
    ) {
        return failure(
            error
        );
    }
}
export async function runtimeControlTool({
    action = "status",
    confirmed = false
} = {}) {
    const mode =
        normalizeAction(
            action,
            {
                start: "start",
                restart: "restart",
                reboot: "restart",
                stop: "shutdown",
                shutdown: "shutdown",
                status: "status",
                health: "health",
                uptime: "uptime",
                memory: "memory",
                process: "process"
            }
        );

    if (
        mode === "status"
    ) {
        return botStatusTool();
    }

    if (
        mode === "health"
    ) {
        return botHealthTool();
    }

    if (
        mode === "uptime"
    ) {
        return botUptimeTool();
    }

    if (
        mode === "memory"
    ) {
        return botMemoryTool();
    }

    if (
        mode === "process"
    ) {
        return botProcessTool();
    }

    requireConfirmed(
        confirmed,
        `runtimeControl ${mode} requires explicit confirmation.`
    );

    if (
        mode === "start"
    ) {
        return botStartTool({
            confirmed: true
        });
    }

    if (
        mode === "restart"
    ) {
        return botRestartTool({
            confirmed: true
        });
    }

    if (
        mode === "shutdown"
    ) {
        return botShutdownTool({
            confirmed: true
        });
    }

    throw new Error(
        "Unknown runtimeControl action."
    );
}

// =====================================================
// 6) PROJECT CONTROL
// =====================================================

export async function projectControlTool({
    action = "health",
    filePath = "",
    query = "",
    errorText = "",
    confirmed = false
} = {}) {
    const mode =
        normalizeAction(
            action,
            {
                map: "map",
                search: "search",
                diagnose: "diagnose",
                health: "health",
                test: "test",
                repair_plan: "repair_plan",
                verify: "verify",
                rollback: "rollback"
            }
        );

    if (
        mode === "map"
    ) {
        return projectMapTool({
            path: filePath || "."
        });
    }

    if (
        mode === "search"
    ) {
        return projectSearchTool({
            query,
            path:
                filePath ||
                "."
        });
    }

    if (
        mode === "diagnose"
    ) {
        return errorDiagnoseTool({
            errorText,
            filePath
        });
    }

    if (
        mode === "health"
    ) {
        return projectHealthTool();
    }

    if (
        mode === "test"
    ) {
        return testSuiteTool({
            run: true,
            confirmed
        });
    }

    if (
        mode === "repair_plan"
    ) {
        return repairPlanTool({
            filePath,
            errorText
        });
    }

    if (
        mode === "verify"
    ) {
        return verifyRepairTool({
            filePath
        });
    }

    if (
        mode === "rollback"
    ) {
        return {
            success: false,
            action: "rollback",
            error:
                "Use rollbackFile directly with the exact current-repair backup path and confirmed=true."
        };
    }

    throw new Error(
        "Unknown projectControl action."
    );
}

// =====================================================
// 7) MEMORY CONTROL
// =====================================================

export async function memoryControlTool({
    action = "read",
    chatId,
    task = "",
    data = {},
    confirmed = false
} = {}) {
    const mode =
        normalizeAction(
            action,
            {
                get: "read",
                read: "read",
                write: "write",
                remember: "write",
                clear: "clear",
                forget: "clear"
            }
        );

    if (
        mode === "read" ||
        mode === "write" ||
        mode === "clear"
    ) {
        return taskMemoryTool({
            action: mode,
            chatId,
            task,
            data,
            confirmed
        });
    }

    if (
        mode === "clear_all"
    ) {
        requireConfirmed(
            confirmed,
            "memoryControl clear_all requires explicit confirmation."
        );

        const result =
            await getDoc(
                "bix_memory",
                safeText(
                    chatId
                )
            );

        if (!result) {
            return {
                success: true,
                action: "clear_all",
                found: false
            };
        }

        await deleteDoc(
            "bix_memory",
            safeText(
                chatId
            )
        );

        return {
            success: true,
            action: "clear_all",
            found: true
        };
    }

    throw new Error(
        "Unknown memoryControl action."
    );
}

// =====================================================
// 8) AUTOMATION CONTROL
// =====================================================

const automationTimers =
    new Map();

function automationKey(id) {
    const safeId =
        safeText(id);

    if (!safeId) {
        throw new Error(
            "Automation id is required."
        );
    }

    if (
        !/^[A-Za-z0-9_-]+$/.test(
            safeId
        )
    ) {
        throw new Error(
            "Automation id may contain only letters, numbers, _ and -."
        );
    }

    return safeId;
}

async function executeAutomationRecord(
    record
) {
    const socket =
        await resolveBixSocket();

    if (
        record.type === "message"
    ) {
        const jid =
            normalizeJid(
                record.target
            );

        const payload = {
            text:
                String(
                    record.text ??
                    ""
                )
        };

        if (
            !payload.text
        ) {
            throw new Error(
                "Automation message text is empty."
            );
        }

        return socket.sendMessage(
            jid,
            payload
        );
    }

    throw new Error(
        `Unsupported automation type: ${record.type}`
    );
}

function scheduleAutomationRecord(
    record
) {
    const id =
        automationKey(
            record.id
        );

    if (
        automationTimers.has(id)
    ) {
        clearTimeout(
            automationTimers.get(
                id
            )
        );
    }

    const targetTime =
        new Date(
            record.nextRunAt
        ).getTime();

    const schedule =
        () => {
            const delay =
                Math.max(
                    1000,
                    Math.min(
                        targetTime -
                            Date.now(),
                        2147483647
                    )
                );

            const timer =
                setTimeout(
                    async () => {
                        try {
                            await executeAutomationRecord(
                                record
                            );

                            record.lastRunAt =
                                controlNow();

                            if (
                                record.repeatMs &&
                                record.repeatMs > 0
                            ) {
                                record.nextRunAt =
                                    new Date(
                                        Date.now() +
                                        record.repeatMs
                                    ).toISOString();

                                await updateControlState(
                                    state => {
                                        state.automations =
                                            isPlainObject(
                                                state.automations
                                            )
                                                ? state.automations
                                                : {};

                                        state.automations[
                                            id
                                        ] =
                                            cloneJson(
                                                record,
                                                {}
                                            );

                                        return state;
                                    }
                                );

                                scheduleAutomationRecord(
                                    record
                                );

                                return;
                            }

                            automationTimers.delete(
                                id
                            );

                            await updateControlState(
                                state => {
                                    state.automations =
                                        isPlainObject(
                                            state.automations
                                        )
                                            ? state.automations
                                            : {};

                                    delete state.automations[
                                        id
                                    ];

                                    return state;
                                }
                            );
                        } catch (error) {
                            record.lastError =
                                safeText(
                                    error?.message
                                );

                            await updateControlState(
                                state => {
                                    state.automations =
                                        isPlainObject(
                                            state.automations
                                        )
                                            ? state.automations
                                            : {};

                                    state.automations[
                                        id
                                    ] =
                                        cloneJson(
                                            record,
                                            {}
                                        );

                                    return state;
                                }
                            );

                            automationTimers.delete(
                                id
                            );
                        }
                    },
                    delay
                );

            automationTimers.set(
                id,
                timer
            );
        };

    schedule();
}

export async function automationControlTool({
    action = "list",
    id = "",
    type = "message",
    target = "",
    text = "",
    runAt = "",
    repeatMs = 0,
    confirmed = false
} = {}) {
    const mode =
        normalizeAction(
            action,
            {
                create: "create",
                add: "create",
                list: "list",
                cancel: "cancel",
                delete: "cancel",
                run: "run"
            }
        );

    const state =
        await loadControlState();

    state.automations =
        isPlainObject(
            state.automations
        )
            ? state.automations
            : {};

    if (
        mode === "list"
    ) {
        return {
            success: true,
            action: "list",
            count:
                Object.keys(
                    state.automations
                ).length,
            automations:
                Object.values(
                    state.automations
                )
        };
    }

    const safeId =
        automationKey(
            id
        );

    requireConfirmed(
        confirmed,
        `automationControl ${mode} requires explicit confirmation.`
    );

    if (
        mode === "cancel"
    ) {
        const timer =
            automationTimers.get(
                safeId
            );

        if (
            timer
        ) {
            clearTimeout(
                timer
            );

            automationTimers.delete(
                safeId
            );
        }

        const existed =
            Object.prototype.hasOwnProperty.call(
                state.automations,
                safeId
            );

        await updateControlState(
            current => {
                current.automations =
                    isPlainObject(
                        current.automations
                    )
                        ? current.automations
                        : {};

                delete current.automations[
                    safeId
                ];

                return current;
            }
        );

        return {
            success: true,
            action: "cancel",
            id: safeId,
            existed
        };
    }

    if (
        mode === "run"
    ) {
        const record =
            state.automations[
                safeId
            ];

        if (!record) {
            throw new Error(
                `Automation does not exist: ${safeId}`
            );
        }

        const result =
            await executeAutomationRecord(
                record
            );

        return {
            success: true,
            action: "run",
            id: safeId,
            result
        };
    }

    if (
        mode === "create"
    ) {
        if (!safeText(runAt)) {
            throw new Error(
                "runAt ISO datetime is required."
            );
        }

        const nextRunMs =
                      new Date(
                runAt
            ).getTime();

        if (
            !Number.isFinite(
                nextRunMs
            )
        ) {
            throw new Error(
                "Invalid runAt datetime."
            );
        }

        if (
            safeText(type) !==
            "message"
        ) {
            throw new Error(
                "Only message automation is currently supported."
            );
        }

        const record = {
            id: safeId,
            type: "message",
            target:
                normalizeJid(
                    target
                ),
            text:
                String(
                    text ?? ""
                ),
            nextRunAt:
                new Date(
                    nextRunMs
                ).toISOString(),
            repeatMs:
                normalizeNumber(
                    repeatMs,
                    0,
                    2147483647,
                    0
                ),
            createdAt:
                controlNow(),
            lastRunAt: null,
            lastError: null
        };

        if (
            !record.text
        ) {
            throw new Error(
                "Automation message text is required."
            );
        }

        await updateControlState(
            current => {
                current.automations =
                    isPlainObject(
                        current.automations
                    )
                        ? current.automations
                        : {};

                current.automations[
                    safeId
                ] =
                    record;

                return current;
            }
        );

        scheduleAutomationRecord(
            record
        );

        return {
            success: true,
            action: "create",
            automation:
                record,
            note:
                "Scheduler is active for the current Node process. The record is persisted, but this scheduler is not automatically rehydrated across process restarts unless startup code calls it."
        };
    }

    throw new Error(
        "Unknown automationControl action."
    );
}

// =====================================================
// 9) MESSAGE CONTROL
// =====================================================

export async function messageControlTool({
    action = "send",
    jid,
    text = "",
    key = null,
    messageId = "",
    participant = "",
    fromMe = false,
    quotedMessage = null,
    emoji = "",
    presence = "available",
    mediaPath = "",
    confirmed = false
} = {}) {
    const mode =
        normalizeAction(
            action,
            {
                reply: "send",
                react: "react",
                remove: "delete",
                edit: "edit",
                typing: "presence",
                read: "read"
            }
        );

    const socket =
        await resolveBixSocket();

    const target =
        normalizeJid(
            jid
        );

    const resolvedMessageKey = isPlainObject(key) ? key : (messageId ? { remoteJid: target, id: String(messageId), fromMe: Boolean(fromMe), ...(participant ? { participant: String(participant) } : {}) } : null);

    if (
        mode === "send"
    ) {
        if (!safeText(text)) {
            throw new Error(
                "Message text is required."
            );
        }

        const options =
            quotedMessage
                ? {
                    quoted:
                        quotedMessage
                  }
                : undefined;

        const result =
            await socket.sendMessage(
                target,
                {
                    text:
                        String(
                            text
                        )
                },
                options
            );

        return {
            success: true,
            action: "send",
            jid: target,
            messageId:
                result?.key?.id ||
                null,
            result
        };
    }

    if (
        mode === "react"
    ) {
        requireConfirmed(
            confirmed,
            "messageControl react requires explicit confirmation."
        );

        if (!isPlainObject(resolvedMessageKey)) {
            throw new Error(
                "A message key object is required for react."
            );
        }

        const result =
            await socket.sendMessage(
                target,
                {
                    react: {
                        text:
                            String(
                                emoji
                            ),
                        key:
                            resolvedMessageKey
                    }
                }
            );

        return {
            success: true,
            action: "react",
            jid: target,
            result
        };
    }

    if (
        mode === "delete"
    ) {
        requireConfirmed(
            confirmed,
            "messageControl delete requires explicit confirmation."
        );

        if (!isPlainObject(resolvedMessageKey)) {
            throw new Error(
                "A message key object is required for delete."
            );
        }

        const result =
            await socket.sendMessage(
                target,
                {
                    delete:
                        resolvedMessageKey
                }
            );

        return {
            success: true,
            action: "delete",
            jid: target,
            result
        };
    }

    if (
        mode === "edit"
    ) {
        requireConfirmed(
            confirmed,
            "messageControl edit requires explicit confirmation."
        );

        if (!isPlainObject(resolvedMessageKey)) {
            throw new Error(
                "A message key object is required for edit."
            );
        }

        if (
            !safeText(text)
        ) {
            throw new Error(
                "Replacement message text is required."
            );
        }

        const result =
            await socket.sendMessage(
                target,
                {
                    text:
                        String(
                            text
                        ),
                    edit:
                        resolvedMessageKey
                }
            );

        return {
            success: true,
            action: "edit",
            jid: target,
            result
        };
    }

    if (
        mode === "presence"
    ) {
        const allowedPresence =
            new Set([
                "available",
                "unavailable",
                "composing",
                "recording",
                "paused"
            ]);

        const selectedPresence =
            safeText(
                presence
            ) ||
            "available";

        if (
            !allowedPresence.has(
                selectedPresence
            )
        ) {
            throw new Error(
                `Unsupported presence: ${selectedPresence}`
            );
        }

        const result =
            await socket.sendPresenceUpdate(
                selectedPresence,
                target
            );

        return {
            success: true,
            action: "presence",
            jid: target,
            presence:
                selectedPresence,
            result
        };
    }

    if (
        mode === "read"
    ) {
        requireConfirmed(
            confirmed,
            "messageControl read requires explicit confirmation."
        );

        if (!isPlainObject(resolvedMessageKey)) {
            throw new Error(
                "A message key object is required for read."
            );
        }

        const result =
            await socket.readMessages([
                key
            ]);

        return {
            success: true,
            action: "read",
            jid: target,
            result
        };
    }

    throw new Error(
        "Unknown messageControl action."
    );
}

// =====================================================
// 10) CHAT CONTROL
// =====================================================

export async function chatControlTool({
    action = "info",
    jid,
    durationSeconds = 0,
    confirmed = false
} = {}) {
    const mode =
        normalizeAction(
            action,
            {
                get: "info",
                mute_chat: "mute",
                unmute_chat: "unmute"
            }
        );

    const target =
        normalizeJid(
            jid
        );

    if (
        mode === "info"
    ) {
        const state =
            await loadControlState();

        const chatStates =
            isPlainObject(
                state.chatStates
            )
                ? state.chatStates
                : {};

        return {
            success: true,
            action: "info",
            jid: target,
            state:
                chatStates[
                    target
                ] ||
                {
                    muted: false
                }
        };
    }

    requireConfirmed(
        confirmed,
        `chatControl ${mode} requires explicit confirmation.`
    );

    if (
        mode === "mute"
    ) {
        const seconds =
            normalizeNumber(
                durationSeconds,
                0,
                31536000,
                0
            );

        const expiresAt =
            seconds > 0
                ? new Date(
                    Date.now() +
                    seconds * 1000
                  ).toISOString()
                : null;

        await updateControlState(
            state => {
                state.chatStates =
                    isPlainObject(
                        state.chatStates
                    )
                        ? state.chatStates
                        : {};

                state.chatStates[
                    target
                ] = {
                    muted: true,
                    durationSeconds:
                        seconds,
                    mutedAt:
                        controlNow(),
                    expiresAt
                };

                return state;
            }
        );

        return {
            success: true,
            action: "mute",
            jid: target,
            durationSeconds:
                seconds,
            expiresAt
        };
    }

    if (
        mode === "unmute"
    ) {
        await updateControlState(
            state => {
                state.chatStates =
                    isPlainObject(
                        state.chatStates
                    )
                        ? state.chatStates
                        : {};

                delete state.chatStates[
                    target
                ];

                return state;
            }
        );

        return {
            success: true,
            action: "unmute",
            jid: target
        };
    }

    throw new Error(
        "Unknown chatControl action."
    );
}
export async function userControlTool({
    action = "block",
    jid = "",
    confirmed = false
} = {}) {
    const mode =
        normalizeAction(
            action,
            {
                ban: "block",
                unban: "unblock",
                block: "block",
                unblock: "unblock",
                list: "list"
            }
        );

    const socket =
        await resolveBixSocket();

    if (
        mode === "list"
    ) {
        if (
            typeof socket.fetchBlocklist !==
            "function"
        ) {
            throw new Error(
                "Active socket does not support fetchBlocklist."
            );
        }

        const list =
            await socket.fetchBlocklist();

        return {
            success: true,
            action: "list",
            count:
                Array.isArray(
                    list
                )
                    ? list.length
                    : 0,
            users:
                list
        };
    }

    requireConfirmed(
        confirmed,
        `userControl ${mode} requires explicit confirmation.`
    );

    const target =
        normalizeParticipantJid(
            jid
        );

    if (
        typeof socket.updateBlockStatus !==
        "function"
    ) {
        throw new Error(
            "Active socket does not support updateBlockStatus."
        );
    }

    const result =
        await socket.updateBlockStatus(
            target,
            mode === "block"
                ? "block"
                : "unblock"
        );

    return {
        success: true,
        action: mode,
        jid: target,
        result
    };
}

// =====================================================
// 12) BROADCAST CONTROL
// =====================================================

export async function broadcastControlTool({
    action = "send",
    recipients = [],
    text = "",
    delayMs = 800,
    confirmed = false
} = {}) {
    const mode =
        normalizeAction(
            action,
            {
                list: "list",
                send: "send"
            }
        );

    const state =
        await loadControlState();

    state.broadcasts =
        Array.isArray(
            state.broadcasts
        )
            ? state.broadcasts
            : [];

    if (
        mode === "list"
    ) {
        return {
            success: true,
            action: "list",
            count:
                state.broadcasts.length,
            recipients:
                state.broadcasts
        };
    }

    if (
        mode !== "send"
    ) {
        throw new Error(
            "broadcastControl action must be send or list."
        );
    }

    requireConfirmed(
        confirmed,
        "Broadcast sending requires explicit confirmation."
    );

    const normalized =
        Array.from(
            new Set(
                (
                    Array.isArray(
                        recipients
                    )
                        ? recipients
                        : []
                )
                    .map(
                        normalizeJid
                    )
            )
        );

    if (
        !normalized.length
    ) {
        throw new Error(
            "At least one broadcast recipient is required."
        );
    }

    if (!safeText(text)) {
        throw new Error(
            "Broadcast text is required."
        );
    }

    const socket =
        await resolveBixSocket();

    const safeDelay =
        normalizeNumber(
            delayMs,
            0,
            60000,
            800
        );

    const results =
        [];

    for (
        let index = 0;
        index < normalized.length;
        index++
    ) {
        const target =
            normalized[
                index
            ];

        try {
            const result =
                await socket.sendMessage(
                    target,
                    {
                        text:
                            String(
                                text
                            )
                    }
                );

            results.push({
                jid: target,
                success: true,
                result
            });
        } catch (error) {
            results.push({
                jid: target,
                success: false,
                error:
                    safeText(
                        error?.message
                    )
            });
        }

        if (
            index <
            normalized.length - 1 &&
            safeDelay > 0
        ) {
            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        safeDelay
                    )
            );
        }
    }

    await updateControlState(
        current => {
            current.broadcasts =
                Array.isArray(
                    current.broadcasts
                )
                    ? current.broadcasts
                    : [];

            current.broadcasts.push({
                sentAt:
                    controlNow(),
                recipients:
                    normalized,
                text:
                    String(
                        text
                    ),
                results:
                    cloneJson(
                        results,
                        []
                    )
            });

            current.broadcasts =
                current.broadcasts.slice(
                    -25
                );

            return current;
        }
    );

    return {
        success:
            results.every(
                item =>
                    item.success
            ),
        action: "send",
        total:
            results.length,
        sent:
            results.filter(
                item =>
                    item.success
            ).length,
        failed:
            results.filter(
                item =>
                    !item.success
            ).length,
        results
    };
}

// =====================================================
// 13) MEDIA CONTROL
// =====================================================

export async function mediaControlTool({
    action = "send",
    jid,
    filePath,
    caption = "",
    asDocument = false,
    fileName = "",
    confirmed = false
} = {}) {
    const mode =
        normalizeAction(
            action,
            {
                upload: "send",
                send: "send"
            }
        );

    if (
        mode !== "send"
    ) {
        throw new Error(
            "mediaControl currently supports send."
        );
    }

    const target =
        normalizeJid(
            jid
        );

    const safePath =
        assertProjectWritablePath(
            filePath
        );

    const targetFile =
        resolveProjectFile(
            safePath
        );

    if (
        !isRegularFile(
            targetFile
        )
    ) {
        throw new Error(
            `Media file does not exist: ${safePath}`
        );
    }

    const extension =
        path.extname(
            targetFile
        ).toLowerCase();

    const mimeMap = {
        ".jpg":
            "image/jpeg",
        ".jpeg":
            "image/jpeg",
        ".png":
            "image/png",
        ".webp":
            "image/webp",
        ".gif":
            "image/gif",
        ".mp4":
            "video/mp4",
        ".mkv":
            "video/x-matroska",
        ".mov":
            "video/quicktime",
        ".mp3":
            "audio/mpeg",
        ".wav":
            "audio/wav",
        ".ogg":
            "audio/ogg",
        ".pdf":
            "application/pdf",
        ".txt":
            "text/plain"
    };

    const mimetype =
        mimeMap[
            extension
        ] ||
        "application/octet-stream";

    const buffer =
        fs.readFileSync(
            targetFile
        );

    const payload = {};

    if (
        mimetype.startsWith(
            "image/"
        )
    ) {
        payload.image =
            buffer;
    } else if (
        mimetype.startsWith(
            "video/"
        )
    ) {
        payload.video =
            buffer;
    } else if (
        mimetype.startsWith(
            "audio/"
        )
    ) {
        payload.audio =
            buffer;
    } else {
        payload.document =
            buffer;

        payload.mimetype =
            mimetype;

        payload.fileName =
            safeText(
                fileName
            ) ||
            path.basename(
                targetFile
            );
    }

    if (
        safeText(
            caption
        )
    ) {
        payload.caption =
            String(
                caption
            );
    }

    if (
        asDocument
    ) {
        delete payload.image;
        delete payload.video;
        delete payload.audio;

        payload.document =
            buffer;

        payload.mimetype =
            mimetype;

        payload.fileName =
            safeText(
                fileName
            ) ||
            path.basename(
                targetFile
            );
    }

    const socket =
        await resolveBixSocket();

    const result =
        await socket.sendMessage(
            target,
            payload
        );

    return {
        success: true,
        action: "send",
        jid: target,
        filePath:
            safePath,
        mimetype,
        messageId:
            result?.key?.id ||
            null,
        result
    };
}
// =====================================================
// 14) PERMISSION CONTROL
// =====================================================

export async function permissionControlTool({
    action = "get",
    subject = "",
    capability = "",
    value = true,
    confirmed = false
} = {}) {
    const mode =
        normalizeAction(
            action,
            {
                set: "set",
                allow: "set",
                deny: "deny",
                get: "get",
                list: "list",
                delete: "delete"
            }
        );

    const state =
        await loadControlState();

    state.permissions =
        isPlainObject(
            state.permissions
        )
            ? state.permissions
            : {};

    if (
        mode === "list"
    ) {
        return {
            success: true,
            action: "list",
            permissions:
                cloneJson(
                    state.permissions,
                    {}
                )
        };
    }

    const safeSubject =
        safeText(
            subject
        );

    const safeCapability =
        safeText(
            capability
        );

    if (
        !safeSubject
    ) {
        throw new Error(
            "Permission subject is required."
        );
    }

    if (
        !safeCapability &&
        mode !== "delete"
    ) {
        throw new Error(
            "Permission capability is required."
        );
    }

    const key =
        safeCapability
            ? `${safeSubject}:${safeCapability}`
            : safeSubject;

    if (
        mode === "get"
    ) {
        return {
            success: true,
            action: "get",
            subject:
                safeSubject,
            capability:
                safeCapability,
            value:
                Object.prototype.hasOwnProperty.call(
                    state.permissions,
                    key
                )
                    ? state.permissions[key]
                    : null,
            exists:
                Object.prototype.hasOwnProperty.call(
                    state.permissions,
                    key
                )
        };
    }

    requireConfirmed(
        confirmed,
        `permissionControl ${mode} requires explicit confirmation.`
    );

    const saved =
        await updateControlState(
            current => {
                current.permissions =
                    isPlainObject(
                        current.permissions
                    )
                        ? current.permissions
                        : {};

                if (
                    mode === "delete"
                ) {
                    delete current.permissions[
                        key
                    ];
                } else {
                    current.permissions[
                        key
                    ] =
                        mode === "deny"
                            ? false
                            : Boolean(
                                value
                              );
                }

                return current;
            }
        );

    return {
        success: true,
        action: mode,
        subject:
            safeSubject,
        capability:
            safeCapability,
        value:
            mode === "delete"
                ? null
                : mode === "deny"
                    ? false
                    : Boolean(
                        value
                      ),
        persisted:
            Boolean(saved),
        note:
            "This stores the control policy. Actual request authorization must consume this policy from the caller/message layer."
    };
}

// =====================================================
// 15) MODULE CONTROL
// =====================================================


export async function moduleControlTool({
    action = "status",
    path: modulePath = "",
    confirmed = false
} = {}) {
    const mode =
        normalizeAction(
            action,
            {
                on: "enable",
                off: "disable",
                enable: "enable",
                disable: "disable",
                status: "status"
            }
        );

    const cleanPath =
        safeText(
            modulePath
        );

    if (!cleanPath) {
        throw new Error(
            "Module path is required."
        );
    }

    const relative =
        normalizeProjectRelative(
            cleanPath
        );

    if (
        mode === "disable" &&
        isCriticalModulePath(relative)
    ) {
        throw new Error(
            `Critical module cannot be disabled by moduleControl: ${relative}`
        );
    }

    const extension =
        path.extname(
            relative
        ).toLowerCase();

    if (
        !CODE_EXTENSIONS.has(
            extension
        )
    ) {
        throw new Error(
            "Module control only supports JavaScript modules."
        );
    }

    const disabledRelative =
        `${relative}.disabled`;

    const activeFile =
        resolveProjectFile(
            relative
        );

    const disabledFile =
        resolveProjectFile(
            disabledRelative
        );

    if (
        mode === "status"
    ) {
        return {
            success: true,
            action: "status",
            path: relative,
            enabled:
                isRegularFile(
                    activeFile
                ),
            disabled:
                isRegularFile(
                    disabledFile
                )
        };
    }

    requireConfirmed(
        confirmed,
        `moduleControl ${mode} requires explicit confirmation.`
    );

    if (
        mode === "disable"
    ) {
        if (
            !isRegularFile(
                activeFile
            )
        ) {
            if (
                isRegularFile(
                    disabledFile
                )
            ) {
                return {
                    success: true,
                    action: "disable",
                    path: relative,
                    changed: false,
                    restartRequired: true
                };
            }

            throw new Error(
                `Module does not exist: ${relative}`
            );
        }

        fs.renameSync(
            activeFile,
            disabledFile
        );

        return {
            success: true,
            action: "disable",
            path: relative,
            changed: true,
            restartRequired: true
        };
    }

    if (
        mode === "enable"
    ) {
        if (
            isRegularFile(
                activeFile
            )
        ) {
            return {
                success: true,
                action: "enable",
                path: relative,
                changed: false,
                restartRequired: true
            };
        }

        if (
            !isRegularFile(
                disabledFile
            )
        ) {
            throw new Error(
                `Disabled module does not exist: ${disabledRelative}`
            );
        }

        fs.renameSync(
            disabledFile,
            activeFile
        );

        return {
            success: true,
            action: "enable",
            path: relative,
            changed: true,
            restartRequired: true
        };
    }

    throw new Error(
        "Unknown moduleControl action."
    );
}

// =====================================================
// 16) DATABASE CONTROL
// =====================================================

export async function databaseControlTool({
    action = "read",
    collection = "",
    id = "",
    data = {},
    confirmed = false
} = {}) {
    const mode =
        normalizeAction(
            action,
            {
                get: "read",
                read: "read",
                write: "write",
                update: "write",
                delete: "delete",
                remove: "delete",
                collections: "collections"
            }
        );

    if (
        mode === "collections"
    ) {
        return {
            success: true,
            action: "collections",
            collections:
                [
                    ...ALLOWED_MONGO_COLLECTIONS
                ]
        };
    }

    const safeCollection =
        validateMongoCollection(
            collection
        );

    const safeId =
        safeText(
            id
        );

    if (
        !safeId
    ) {
        throw new Error(
            "Database document id is required."
        );
    }

    if (
        mode === "read"
    ) {
        return mongoReadTool({
            collection:
                safeCollection,
            id:
                safeId
        });
    }

    requireConfirmed(
        confirmed,
        `databaseControl ${mode} requires explicit confirmation.`
    );

    if (
        mode === "write"
    ) {
        return mongoUpdateTool({
            collection:
                safeCollection,
            id:
                safeId,
            data,
            confirmed: true
        });
    }

    if (
        mode === "delete"
    ) {
        await deleteDoc(
            safeCollection,
            safeId
        );

        return {
            success: true,
            action: "delete",
            collection:
                safeCollection,
            id:
                safeId
        };
    }

    throw new Error(
        "Unknown databaseControl action."
    );
}

// =====================================================
// 17) AI CONTROL
// =====================================================

export async function aiControlTool({
      action = "get",
    key = "",
    value = null,
    confirmed = false
} = {}) {
    const mode =
        normalizeAction(
            action,
            {
                set: "set",
                enable: "set",
                disable: "disable",
                get: "get",
                list: "list",
                delete: "delete"
            }
        );

    const state =
        await loadControlState();

    state.ai =
        isPlainObject(
            state.ai
        )
            ? state.ai
            : {};

    if (
        mode === "list"
    ) {
        return {
            success: true,
            action: "list",
            settings:
                cloneJson(
                    state.ai,
                    {}
                )
        };
    }

    const safeKey =
        safeText(
            key
        );

    if (
        !safeKey
    ) {
        throw new Error(
            "AI setting key is required."
        );
    }

    if (
        mode === "get"
    ) {
        return {
            success: true,
            action: "get",
            key: safeKey,
            value:
                Object.prototype.hasOwnProperty.call(
                    state.ai,
                    safeKey
                )
                    ? state.ai[safeKey]
                    : null
        };
    }

    requireConfirmed(
        confirmed,
        `aiControl ${mode} requires explicit confirmation.`
    );

    if (
        mode === "delete"
    ) {
        const saved =
            await updateControlState(
                current => {
                    current.ai =
                        isPlainObject(
                            current.ai
                        )
                            ? current.ai
                            : {};

                    delete current.ai[
                        safeKey
                    ];

                    return current;
                }
            );

        return {
            success: true,
            action: "delete",
            key: safeKey,
            persisted:
                Boolean(saved)
        };
    }

    if (
        mode === "disable"
    ) {
        value = false;
    }

    const runtime =
        await tryApplyRuntimeSetting(
            safeKey,
            value
        );

    const saved =
        await updateControlState(
            current => {
                current.ai =
                    isPlainObject(
                        current.ai
                    )
                        ? current.ai
                        : {};

                current.ai[
                    safeKey
                ] =
                    value;

                return current;
            }
        );

    return {
        success: true,
        action:
            mode === "disable"
                ? "disable"
                : "set",
        key: safeKey,
        value,
        runtime,
        persisted:
            Boolean(saved),
        restartRequired:
            Boolean(
                runtime?.restartRequired
            )
    };
}

// =====================================================
// 18) ADMIN CONTROL
// =====================================================

export async function adminControlTool({
    action = "status",
    groupJid = "",
    participant = "",
    key = "",
    value = null,
    confirmed = false
} = {}) {
    const mode =
        normalizeAction(
            action,
            {
                kick: "kick",
                ban: "ban",
                unban: "unban",
                mute: "mute_chat",
                unmute: "unmute_chat",
                promote: "promote",
                demote: "demote",
                restart: "restart",
                shutdown: "shutdown",
                start: "start",
                status: "status",
                health: "health"
            }
        );

    if (
        mode === "status" ||
        mode === "health"
    ) {
        return runtimeControlTool({
            action:
                mode
        });
    }

    if (
        mode === "restart" ||
        mode === "shutdown" ||
        mode === "start"
    ) {
        return runtimeControlTool({
            action:
                mode,
            confirmed
        });
    }

    if (
        mode === "kick" ||
        mode === "ban" ||
        mode === "unban" ||
        mode === "promote" ||
        mode === "demote"
    ) {
        return groupControlTool({
            action:
                mode === "kick"
                    ? "remove"
                    : mode,
            groupJid,
            participant,
            confirmed
        });
    }

    if (
        mode === "mute_chat" ||
        mode === "unmute_chat"
    ) {
        return chatControlTool({
            action:
                mode === "mute_chat"
                    ? "mute"
                    : "unmute",
            jid:
                participant ||
                groupJid,
            durationSeconds:
                Number(
                    value
                ) || 0,
            confirmed
        });
    }

    if (
        mode === "permission"
    ) {
        return permissionControlTool({
            action: "set",
            subject:
                participant ||
                key,
            capability:
                key,
            value,
            confirmed
        });
    }

    throw new Error(
        "Unknown adminControl action."
    );
}

// =====================================================
// CONTROL TOOL OBJECT
// =====================================================

export const bixControlTools = {
    commandControl:
        commandControlTool,

    settingsControl:
        settingsControlTool,

    groupControl:
        groupControlTool,

    groupSettingsControl:
        groupSettingsControlTool,

    runtimeControl:
        runtimeControlTool,

    projectControl:
        projectControlTool,

    memoryControl:
        memoryControlTool,

    automationControl:
        automationControlTool,

    messageControl:
        messageControlTool,

    chatControl:
        chatControlTool,

    userControl:
        userControlTool,

    broadcastControl:
        broadcastControlTool,

    mediaControl:
        mediaControlTool,

    permissionControl:
        permissionControlTool,

    moduleControl:
        moduleControlTool,

    databaseControl:
        databaseControlTool,

    aiControl:
        aiControlTool,

    adminControl:
        adminControlTool
};

// =====================================================
// CONTROL TOOL DESCRIPTIONS
// =====================================================

const bixControlToolDescriptions = {
    commandControl: {
        description:
            "Enable, disable, inspect, or list real JavaScript bot commands. Enable/disable is done by reversible .disabled file renaming and persisted in Bix settings.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: [
                        "enable",
                        "disable",
                        "status",
                        "list"
                    ]
                },
                command: {
                    type: "string"
                },
                enabled: {
                    type: "boolean"
                },
                confirmed: {
                    type: "boolean"
                }
            }
        }
    },

    settingsControl: {
        description:
            "Read, set, or delete persistent Bix/bot settings. Runtime application is attempted where supported and restart requirements are reported honestly.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: [
                        "get",
                        "set",
                        "delete",
                        "list"
                    ]
                },
                key: {
                    type: "string"
                },
                value: {}
            }
        }
    },

    groupControl: {
        description:
            "Perform real WhatsApp group participant and group-level administrative operations through the live Baileys socket.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: [
                        "add",
                        "remove",
                        "promote",
                        "demote",
                        "ban",
                        "unban",
                        "leave",
                        "inviteCode",
                        "revokeInvite"
                    ]
                },
                groupJid: {
                    type: "string"
                },
                participant: {
                    type: "string"
                },
                confirmed: {
                    type: "boolean"
                }
            }
        }
    },

    groupSettingsControl: {
        description:
            "Read or change real WhatsApp group settings such as subject, description, announcement mode, locked mode, ephemeral messages, member add mode, and invite settings.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: [
                        "subject",
                        "description",
                        "announcement",
                        "not_announcement",
                        "locked",
                        "unlocked",
                        "ephemeral",
                        "member_add_mode",
                        "invite_code",
                        "revoke_invite"
                    ]
                },
                groupJid: {
                    type: "string"
                },
                value: {}
            }
        }
    },

    runtimeControl: {
        description:
            "Inspect or control the real bot runtime through the registered botRuntime handlers. Start, restart, and shutdown require explicit confirmation.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: [
                        "status",
                        "health",
                        "uptime",
                        "memory",
                        "process",
                        "start",
                        "restart",
                        "shutdown"
                    ]
                },
                confirmed: {
                    type: "boolean"
                }
            }
        }
    },

    projectControl: {
        description:
            "Inspect project-level state, structure, health, and controlled project operations.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string"
                },
                path: {
                    type: "string"
                },
                confirmed: {
                    type: "boolean"
                }
            }
        }
    },

    memoryControl: {
        description:
            "Read, write, update, delete, and clear Bix persistent memory using the project's existing database architecture.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string"
                },
                key: {
                    type: "string"
                },
                value: {}
            }
        }
    },

    automationControl: {
        description:
            "Create, list, inspect, run, enable, disable, and cancel persistent Bix automations. Sensitive actions still require runtime confirmation.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string"
                },
                id: {
                    type: "string"
                },
                automation: {},
                confirmed: {
                    type: "boolean"
                }
            }
        }
    },

    messageControl: {
        description:
            "Perform supported message operations through the real Baileys socket, including delete, react, read, and typing/presence operations.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string"
                },
                jid: {
                    type: "string"
                },
                messageId: {
                    type: "string"
                },
                participant: {
                    type: "string"
                },
                fromMe: {
                    type: "boolean"
                },
                key: {
                    type: "object"
                },
                text: {
                    type: "string"
                },
                confirmed: {
                    type: "boolean"
                }
            }
        }
    },

    chatControl: {
        description:
            "Perform supported real chat operations through the live Baileys socket, with capability-dependent behavior reported honestly.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string"
                },
                jid: {
                    type: "string"
                },
                durationSeconds: {
                    type: "number"
                },
                confirmed: {
                    type: "boolean"
                }
            }
        }
    },

    userControl: {
        description:
            "Manage supported real WhatsApp user operations such as block and unblock using the live Baileys socket.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string"
                },
                jid: {
                    type: "string"
                },
                confirmed: {
                    type: "boolean"
                }
            }
        }
    },

    broadcastControl: {
        description:
            "Safely send a controlled broadcast to validated recipients using the live socket, sequentially and with partial-failure reporting.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string"
                },
                recipients: {
                    type: "array",
                    items: {
                        type: "string"
                    }
                },
                message: {
                    type: "string"
                },
                confirmed: {
                    type: "boolean"
                }
            }
        }
    },

    mediaControl: {
        description:
            "Send a project-local media/document file to a WhatsApp JID. Only project-local files are allowed.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string"
                },
                filePath: {
                    type: "string"
                },
                caption: {
                    type: "string"
                },
                asDocument: {
                    type: "boolean"
                },
                fileName: {
                    type: "string"
                },
                destination: {
                    type: "string"
                },
                confirmed: {
                    type: "boolean"
                }
            }
        }
    },

    permissionControl: {
        description:
            "Manage persistent Bix capability policies. The stored policy is an authorization source of truth, while actual enforcement must be consumed by the message/caller authorization layer.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string"
                },
                subject: {
                    type: "string"
                },
                capability: {
                    type: "string"
                },
                value: {}
            }
        }
    },

    moduleControl: {
        description:
            "Inspect, enable, or disable project modules by reversible file operations while protecting critical bot infrastructure.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string"
                },
                module: {
                    type: "string"
                },
                confirmed: {
                    type: "boolean"
                }
            }
        }
    },

    databaseControl: {
        description:
            "Perform approved safe MongoDB operations through the existing database helpers without exposing arbitrary database execution.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string"
                },
                collection: {
                    type: "string"
                },
                key: {
                    type: "string"
                },
                value: {}
            }
        }
    },

    aiControl: {
        description:
            "Read and manage persistent AI/Bix configuration, attempting runtime application where supported and reporting when restart/reload is required.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: [
                        "get",
                        "set",
                        "enable",
                        "disable",
                        "list",
                        "delete"
                    ]
                },
                key: {
                    type: "string"
                },
                value: {}
            }
        }
    },

    adminControl: {
        description:
            "High-level administrative router that delegates to real runtime, group, chat, and permission controls.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string"
                },
                groupJid: {
                    type: "string"
                },
                participant: {
                    type: "string"
                },
                key: {
                    type: "string"
                },
                value: {}
            }
        }
    }
};
// Rehydrate persisted one-shot/repeating automations when this module is first loaded.
// Socket availability is optional at import time; scheduling only happens after state is read.
(async () => {
    try {
        const state =
            await loadControlState();

        const automations =
            isPlainObject(
                state?.automations
            )
                ? state.automations
                : {};

        for (
            const record
            of Object.values(
                automations
            )
        ) {
            if (
                record?.id &&
                record?.nextRunAt
            ) {
                try {
                    scheduleAutomationRecord(
                        record
                    );
                } catch {
                    // Keep import safe if a persisted record is malformed.
                }
            }
        }
    } catch {
        // Database may not be ready during module initialization.
    }
})();


// =====================================================
// FINAL TOOL REGISTRY
// =====================================================

export const bixTools = {
    readFile: readFileTool,
    writeFile: writeFileTool,
    rollbackFile: rollbackFileTool,
    deleteFile: deleteFileTool,
    createCommand: createCommandTool,
    editCommand: editCommandTool,
    deleteCommand: deleteCommandTool,
    listCommands: listCommandsTool,
    inspectCommand: inspectCommandTool,
    syntaxTest: syntaxTestTool,
    runTest: runTestTool,
    readLogs: readLogsTool,
    runCommand: runCommandTool,
    checkDependencies: checkDependenciesTool,
    mongoRead: mongoReadTool,
    mongoUpdate: mongoUpdateTool,
    clearBixMemory: clearBixMemoryTool,
    botStatus: botStatusTool,
    botHealth: botHealthTool,
    botUptime: botUptimeTool,
    botMemory: botMemoryTool,
    botProcess: botProcessTool,
    botStart: botStartTool,
    botRestart: botRestartTool,
    botShutdown: botShutdownTool,
    dependencyAudit: dependencyAuditTool,
    projectSearch: projectSearchTool,
    projectMap: projectMapTool,
    findReferences: findReferencesTool,
    errorDiagnose: errorDiagnoseTool,
    testSuite: testSuiteTool,
    commandSearch: commandSearchTool,
    fileDiff: fileDiffTool,
    repairPlan: repairPlanTool,
    verifyRepair: verifyRepairTool,
    projectHealth: projectHealthTool,
    taskMemory: taskMemoryTool,
    commandControl: commandControlTool,
    settingsControl: settingsControlTool,
    groupControl: groupControlTool,
    groupSettingsControl: groupSettingsControlTool,
    runtimeControl: runtimeControlTool,
    projectControl: projectControlTool,
    memoryControl: memoryControlTool,
    automationControl: automationControlTool,
    messageControl: messageControlTool,
    chatControl: chatControlTool,
    userControl: userControlTool,
    broadcastControl: broadcastControlTool,
    mediaControl: mediaControlTool,
    permissionControl: permissionControlTool,
    moduleControl: moduleControlTool,
    databaseControl: databaseControlTool,
    aiControl: aiControlTool,
    adminControl: adminControlTool
};


// =====================================================
// TOOL DESCRIPTION HELPERS
// =====================================================

const emptyObject = {
    type:
        "object",

    properties:
        {},

    additionalProperties:
        false
};


// =====================================================
// TOOL DESCRIPTIONS
// =====================================================

export const bixToolDescriptions = {

    ...bixControlToolDescriptions,

    readFile: {
        description:
            "Read an approved file inside the ABIX project.",

        parameters: {
            type:
                "object",

            properties: {
                filePath: {
                    type:
                        "string",

                    description:
                        "Project-relative file path."
                }
            },

            required: [
                "filePath"
            ],

            additionalProperties:
                false
        }
    },


    writeFile: {
        description:
            "Write an approved project file. Existing files are automatically backed up.",

        parameters: {
            type:
                "object",

            properties: {
                filePath: {
                    type:
                        "string"
                },

                content: {
                    type:
                        "string"
                },

                backup: {
                    type:
                        "boolean"
                }
            },

            required: [
                "filePath",
                "content"
            ],

            additionalProperties:
                false
        }
    },


    deleteFile: {
        description:
            "Delete an approved project-local file after explicit confirmation. The file is backed up automatically before deletion.",

        parameters: {
            type: "object",
            properties: {
                filePath: { type: "string" },
                confirmed: { type: "boolean" }
            },
            required: ["filePath", "confirmed"],
            additionalProperties: false
        }
    },

    rollbackFile: {
        description:
            "Restore a project file from a Bix backup. Requires explicit confirmation and a backup inside database/file-backups.",

        parameters: {
            type:
                "object",

            properties: {
                filePath: {
                    type:
                        "string"
                },

                backupPath: {
                    type:
                        "string"
                },

                confirmed: {
                    type:
                        "boolean"
                }
            },

            required: [
                "filePath",
                "backupPath",
                "confirmed"
            ],

            additionalProperties:
                false
        }
    },


    createCommand: {
        description:
            "Create a new JavaScript bot command.",

        parameters: {
            type:
                "object",

            properties: {
                name: {
                    type:
                        "string"
                },

                content: {
                    type:
                        "string"
                }
            },

            required: [
                "name",
                "content"
            ],

            additionalProperties:
                false
        }
    },


    editCommand: {
        description:
            "Edit an existing JavaScript bot command and create a backup.",

        parameters: {
            type:
                "object",

            properties: {
                name: {
                    type:
                        "string"
                },

                content: {
                    type:
                        "string"
                }
            },

            required: [
                "name",
                "content"
            ],

            additionalProperties:
                false
        }
    },


    deleteCommand: {
        description:
            "Delete a bot command after explicit confirmation.",

        parameters: {
            type:
                "object",

            properties: {
                name: {
                    type:
                        "string"
                },

                confirmed: {
                    type:
                        "boolean"
                }
            },

            required: [
                "name",
                "confirmed"
            ],

            additionalProperties:
                false
        }
    },


    listCommands: {
        description:
            "List all JavaScript bot commands in the commands folder.",

        parameters:
            emptyObject
    },


    inspectCommand: {
        description:
            "Inspect an existing bot command including its source code.",

        parameters: {
            type:
                "object",

            properties: {
                name: {
                    type:
                        "string"
                }
            },

            required: [
                "name"
            ],

            additionalProperties:
                false
        }
    },


    syntaxTest: {
        description:
            "Run Node.js syntax validation on a project JavaScript file.",

        parameters: {
            type:
                "object",

            properties: {
                filePath: {
                    type:
                        "string"
                }
            },

            required: [
                "filePath"
            ],

            additionalProperties:
                false
        }
    },
      runTest: {
        description:
            "Run a specific JavaScript test file inside the project.",

        parameters: {
            type:
                "object",

            properties: {
                filePath: {
                    type:
                        "string"
                }
            },

            required: [
                "filePath"
            ],

            additionalProperties:
                false
        }
    },


    readLogs: {
        description:
            "Read recent output from the latest available bot log file.",

        parameters: {
            type:
                "object",

            properties: {
                lines: {
                    type:
                        "number",

                    minimum:
                        1,

                    maximum:
                        500
                }
            },

            additionalProperties:
                false
        }
    },


    runCommand: {
        description:
            "Run one predefined safe project diagnostic command.",

        parameters: {
            type:
                "object",

            properties: {
                command: {
                    type:
                        "string",

                    enum: [
                        "pwd",
                        "node_version",
                        "npm_version",
                        "npm_list",
                        "project_check"
                    ]
                }
            },

            required: [
                "command"
            ],

            additionalProperties:
                false
        }
    },


    checkDependencies: {
        description:
            "Inspect the project's declared and installed dependencies.",

        parameters: {
            type:
                "object",

            properties: {},

            additionalProperties:
                false
        }
    },


    mongoRead: {
        description:
            "Read approved MongoDB data through the existing database helper layer.",

        parameters: {
            type:
                "object",

            properties: {
                collection: {
                    type:
                        "string"
                },

                key: {
                    type:
                        "string"
                }
            },

            required: [
                "collection"
            ],

            additionalProperties:
                false
        }
    },


    mongoUpdate: {
        description:
            "Update approved MongoDB data through the existing database helper layer.",

        parameters: {
            type:
                "object",

            properties: {
                collection: {
                    type:
                        "string"
                },

                key: {
                    type:
                        "string"
                },

                value: {},

                confirmed: {
                    type:
                        "boolean"
                }
            },

            required: [
                "collection",
                "key"
            ],

            additionalProperties:
                false
        }
    },


    clearBixMemory: {
        description:
            "Clear all Bix memory for one chat after explicit confirmation.",

        parameters: {
            type:
                "object",

            properties: {
                chatId: {
                    type:
                        "string"
                },

                confirmed: {
                    type:
                        "boolean"
                }
            },

            required: [
                "chatId",
                "confirmed"
            ],

            additionalProperties:
                false
        }
    },


    botStatus: {
        description:
            "Get current ABIX bot runtime status.",

        parameters:
            emptyObject
    },


    botHealth: {
        description:
            "Get a combined ABIX bot health snapshot.",

        parameters:
            emptyObject
    },


    botUptime: {
        description:
            "Get current ABIX bot uptime and startup timestamps.",

        parameters:
            emptyObject
    },


    botMemory: {
        description:
            "Get Node.js process memory usage.",

        parameters:
            emptyObject
    },


    botProcess: {
        description:
            "Get ABIX process information including PID and platform.",

        parameters:
            emptyObject
    },


    botStart: {
        description:
            "Start ABIX through the controlled runtime interface. Requires confirmation.",

        parameters: {
            type:
                "object",

            properties: {
                confirmed: {
                    type:
                        "boolean"
                }
            },

            required: [
                "confirmed"
            ],

            additionalProperties:
                false
        }
    },


    botRestart: {
        description:
            "Restart ABIX through the controlled runtime interface. Requires confirmation.",

        parameters: {
            type:
                "object",

            properties: {
                confirmed: {
                    type:
                        "boolean"
                }
            },

            required: [
                "confirmed"
            ],

            additionalProperties:
                false
        }
    },


    botShutdown: {
        description:
            "Stop ABIX through the controlled runtime interface. Requires confirmation.",

        parameters: {
            type:
                "object",

            properties: {
                confirmed: {
                    type:
                        "boolean"
                }
            },

            required: [
                "confirmed"
            ],

            additionalProperties:
                false
        }
    },
      dependencyAudit: {
        description:
            "Audit direct dependencies, installed versions, lockfiles, and npm dependency problems.",

        parameters: {
            type:
                "object",

            properties: {
                includeTransitive: {
                    type:
                        "boolean"
                }
            },

            additionalProperties:
                false
        }
    },


    mongoRead: {
        description:
            "Read an approved MongoDB document.",

        parameters: {
            type:
                "object",

            properties: {
                collection: {
                    type:
                        "string",

                    enum:
                        ALLOWED_MONGO_COLLECTIONS
                },

                id: {
                    type:
                        "string"
                }
            },

            required: [
                "collection",
                "id"
            ],

            additionalProperties:
                false
        }
    },


    mongoUpdate: {
        description:
            "Update an approved MongoDB document after explicit confirmation.",

        parameters: {
            type:
                "object",

            properties: {
                collection: {
                    type:
                        "string",

                    enum:
                        ALLOWED_MONGO_COLLECTIONS
                },

                id: {
                    type:
                        "string"
                },

                updates: {
                    type:
                        "object"
                },

                confirmed: {
                    type:
                        "boolean"
                }
            },

            required: [
                "collection",
                "id",
                "updates"
            ],

            additionalProperties:
                false
        }
    },


    clearBixMemory: {
        description:
            "Clear persistent Bix memory for a selected chat or memory scope after explicit confirmation.",

        parameters: {
            type:
                "object",

            properties: {
                chatId: {
                    type:
                        "string"
                },

                confirmed: {
                    type:
                        "boolean"
                }
            },

            required: [
                "confirmed"
            ],

            additionalProperties:
                false
        }
    },


    botStatus: {
        description:
            "Return the real current ABIX bot runtime status.",

        parameters:
            emptyObject
    },


    botHealth: {
        description:
            "Return the real current ABIX bot health information.",

        parameters:
            emptyObject
    },


    botUptime: {
        description:
            "Return the real current ABIX bot uptime.",

        parameters:
            emptyObject
    },


    botMemory: {
        description:
            "Return real Node.js process memory information.",

        parameters:
            emptyObject
    },


    botProcess: {
        description:
            "Return real Node.js process information for ABIX.",

        parameters:
            emptyObject
    },


    botStart: {
        description:
            "Start the real ABIX runtime through the registered runtime handler. Explicit confirmation is required.",

        parameters: {
            type:
                "object",

            properties: {
                confirmed: {
                    type:
                        "boolean"
                }
            },

            required: [
                "confirmed"
            ],

            additionalProperties:
                false
        }
    },


    botRestart: {
        description:
            "Restart the real ABIX runtime through the registered runtime handler. Explicit confirmation is required.",

        parameters: {
            type:
                "object",

            properties: {
                confirmed: {
                    type:
                        "boolean"
                }
            },

            required: [
                "confirmed"
            ],

            additionalProperties:
                false
        }
    },


    botShutdown: {
        description:
            "Stop the real ABIX runtime through the registered runtime handler. Explicit confirmation is required.",

        parameters: {
            type:
                "object",

            properties: {
                confirmed: {
                    type:
                        "boolean"
                }
            },

            required: [
                "confirmed"
            ],

            additionalProperties:
                false
        }
    },


    projectSearch: {
        description:
            "Search the actual ABIX project for text, symbols, filenames, or references.",

        parameters: {
            type:
                "object",

            properties: {
                query: {
                    type:
                        "string"
                },

                path: {
                    type:
                        "string"
                }
            },

            required: [
                "query"
            ],

            additionalProperties:
                false
        }
    },


    projectMap: {
        description:
            "Inspect and map the real ABIX project structure.",

        parameters: {
            type:
                "object",

            properties: {
                path: {
                    type:
                        "string"
                },

                depth: {
                    type:
                        "number"
                }
            },

            additionalProperties:
                false
        }
    },


    findReferences: {
        description:
            "Find actual references to a file, function, command, module, or symbol inside the project.",

        parameters: {
            type:
                "object",

            properties: {
                query: {
                    type:
                        "string"
                },

                path: {
                    type:
                        "string"
                }
            },

            required: [
                "query"
            ],

            additionalProperties:
                false
        }
    },


    errorDiagnose: {
        description:
            "Diagnose a real project error using source files, stack traces, logs, dependencies, and project structure.",

        parameters: {
            type:
                "object",

            properties: {
                errorText: {
                    type:
                        "string"
                },

                filePath: {
                    type:
                        "string"
                },

                confirmed: {
                    type:
                        "boolean"
                }
            },

            required: [
                "errorText"
            ],

            additionalProperties:
                false
        }
    },


    testSuite: {
        description:
            "Run the available project test suite and return actual test results.",

        parameters: {
            type:
                "object",

            properties: {
                pattern: {
                    type:
                        "string"
                },

                timeoutMs: {
                    type:
                        "number"
                }
            },

            additionalProperties:
                false
        }
    },


    commandSearch: {
        description:
            "Search the actual commands directory for matching bot commands.",

        parameters: {
            type:
                "object",

            properties: {
                query: {
                    type:
                        "string"
                }
            },

            required: [
                "query"
            ],

            additionalProperties:
                false
        }
    },


    fileDiff: {
        description:
            "Compare a real project file with a backup or another supplied version.",

        parameters: {
            type:
                "object",

            properties: {
                filePath: {
                    type:
                        "string"
                },

                backupPath: {
                    type:
                        "string"
                },

                content: {
                    type:
                        "string"
                }
            },

            required: [
                "filePath"
            ],

            additionalProperties:
                false
        }
    },


    repairPlan: {
        description:
            "Analyze an actual project problem and produce an evidence-based repair plan.",

        parameters: {
            type:
                "object",

            properties: {
                problem: {
                    type:
                        "string"
                },

                filePath: {
                    type:
                        "string"
                }
            },

            required: [
                "problem"
            ],

            additionalProperties:
                false
        }
    },


    verifyRepair: {
        description:
            "Verify a repair using actual syntax checks, tests, project inspection, and relevant runtime checks.",

        parameters: {
            type:
                "object",

            properties: {
                filePath: {
                    type:
                        "string"
                },

                testPath: {
                    type:
                        "string"
                }
            },

            additionalProperties:
                false
        }
    },


    projectHealth: {
        description:
            "Check the overall health of the real project, including files, syntax, dependencies, runtime, and database readiness.",

        parameters:
            emptyObject
    },


    taskMemory: {
        description:
            "Persist and retrieve durable Bix task memory using the project's controlled database layer.",

        parameters: {
            type:
                "object",

            properties: {
                action: {
                    type:
                        "string",

                    enum: [
                        "get",
                        "set",
                        "update",
                        "delete",
                        "clear"
                    ]
                },

                key: {
                    type:
                        "string"
                },

                value: {},

                confirmed: {
                    type:
                        "boolean"
                }
            },

            required: [
                "action"
            ],

            additionalProperties:
                false
        }
    },
  };


// =====================================================
// OPENAI-COMPATIBLE DEFINITIONS
// =====================================================

export const bixToolDefinitions =
    Object.entries(
        bixToolDescriptions
    ).map(
        ([
            name,
            definition
        ]) => ({
            type:
                "function",

            function: {
                name,

                description:
                    definition.description,

                parameters:
                    definition.parameters
            }
        })
    );


// =====================================================
// TOOL META
// =====================================================

export const bixToolNames =
    Object.keys(
        bixTools
    );

export const BIX_TOOL_COUNT =
    bixToolNames.length;


// =====================================================
// CONFIG
// =====================================================

export const bixToolsConfig = {

    projectRoot:
        PROJECT_ROOT,

    commandsPath:
        COMMANDS_PATH,

    databasePath:
        DATABASE_PATH,

    logPath:
        LOG_PATH,

    backupPath:
        BACKUP_PATH,

    testsPath:
        TESTS_PATH,

    maxReadBytes:
        MAX_READ_BYTES,

    maxWriteBytes:
        MAX_WRITE_BYTES,

    maxOutputLength:
        MAX_OUTPUT_LENGTH,

    commandTimeout:
        COMMAND_TIMEOUT,

    testSuiteTimeout:
        TEST_SUITE_TIMEOUT,

    maxScanFiles:
        MAX_SCAN_FILES,

    maxSearchMatches:
        MAX_SEARCH_MATCHES,

    maxReferenceMatches:
        MAX_REFERENCE_MATCHES,

    maxProjectMapEntries:
        MAX_PROJECT_MAP_ENTRIES,

    maxTestFiles:
        MAX_TEST_FILES,

    allowedMongoCollections:
        [
            ...ALLOWED_MONGO_COLLECTIONS
        ],

    controlledCommands:
        Object.keys(
            SAFE_COMMANDS
        ),

    protectedDirectories:
        [
            ...SKIP_DIRS
        ],

    toolCount:
        BIX_TOOL_COUNT,

    toolNames:
        [
            ...bixToolNames
        ],

    toolDefinitions:
        bixToolDefinitions
};
// =====================================================
// STARTUP VALIDATION
// =====================================================

const describedToolNames =
    Object.keys(
        bixToolDescriptions
    );


const missingDefinitions =
    bixToolNames.filter(
        name =>
            !describedToolNames.includes(
                name
            )
    );


const missingImplementations =
    describedToolNames.filter(
        name =>
            typeof bixTools[
                name
            ] !== "function"
    );


if (
    bixToolNames.length !==
    describedToolNames.length
) {
    console.warn(
        "⚠️ Bix tool registry/description count mismatch:",
        bixToolNames.length,
        describedToolNames.length
    );
}


if (
    missingDefinitions.length
) {
    console.warn(
        "⚠️ Bix tools missing descriptions:",
        missingDefinitions
    );
}


if (
    missingImplementations.length
) {
    console.warn(
        "⚠️ Bix descriptions missing implementations:",
        missingImplementations
    );
}


if (
    bixToolDefinitions.length !==
    BIX_TOOL_COUNT
) {
    console.warn(
        "⚠️ Bix tool definition count mismatch:",
        bixToolDefinitions.length,
        BIX_TOOL_COUNT
    );
}