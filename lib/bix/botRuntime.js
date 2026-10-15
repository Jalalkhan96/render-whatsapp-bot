let currentSocket = null;
let botStartedAt = null;
let botReadyAt = null;
let botState = "stopped";
let restartHandler = null;
let startHandler = null;
let shutdownInProgress = false;

export function registerBixRuntime({ getSocket, startBot, restartBot } = {}) {
    if (typeof getSocket === "function") {
        try { currentSocket = getSocket() || currentSocket; } catch {}
    }
    if (typeof startBot === "function") startHandler = startBot;
    if (typeof restartBot === "function") restartHandler = restartBot;
}

export function setBixRuntimeSocket(sock) {
    currentSocket = sock || null;
    if (sock) {
        if (!botStartedAt) botStartedAt = new Date();
        botState = "connected";
        botReadyAt = new Date();
        shutdownInProgress = false;
    } else {
        botState = "stopped";
    }
    return currentSocket;
}

export function getRuntimeSocket() { return currentSocket; }
export const getBixRuntimeSocket = getRuntimeSocket;
export function setBotState(state) { botState = String(state || "unknown"); }
export function setBotReady() { botState = "connected"; botReadyAt = new Date(); shutdownInProgress = false; }
export function setBotStopped() { botState = "stopped"; currentSocket = null; shutdownInProgress = false; }

function uptimeSeconds() {
    return botStartedAt ? Math.max(0, Math.floor((Date.now() - botStartedAt.getTime()) / 1000)) : 0;
}

function formatUptime(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h || d) parts.push(`${h}h`);
    if (m || h || d) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(" ");
}

export function getBotStatus() {
    return {
        success: true,
        state: botState,
        socket: Boolean(currentSocket),
        socketReady: Boolean(currentSocket?.ws),
        startedAt: botStartedAt?.toISOString() || null,
        readyAt: botReadyAt?.toISOString() || null,
        uptimeSeconds: uptimeSeconds(),
        uptime: formatUptime(uptimeSeconds()),
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        shutdownInProgress,
    };
}

export function getBotHealth() {
    const status = getBotStatus();
    const memory = getBotMemory();
    return {
        success: true,
        healthy: status.state === "connected" && status.socket,
        state: status.state,
        socket: status.socket,
        socketReady: status.socketReady,
        uptime: status.uptime,
        memory: {
            rssMB: Number((memory.rss / 1024 / 1024).toFixed(2)),
            heapUsedMB: Number((memory.heapUsed / 1024 / 1024).toFixed(2)),
            heapTotalMB: Number((memory.heapTotal / 1024 / 1024).toFixed(2)),
        },
        process: { pid: process.pid, node: process.version, platform: process.platform },
    };
}

export function getBotMemory() {
    const memory = process.memoryUsage();
    return {
        success: true,
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external,
        arrayBuffers: memory.arrayBuffers,
        rssMB: Number((memory.rss / 1024 / 1024).toFixed(2)),
        heapTotalMB: Number((memory.heapTotal / 1024 / 1024).toFixed(2)),
        heapUsedMB: Number((memory.heapUsed / 1024 / 1024).toFixed(2)),
    };
}

export function getBotProcess() {
    return {
        success: true,
        pid: process.pid,
        ppid: process.ppid,
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        cwd: process.cwd(),
        uptimeSeconds: process.uptime(),
        argv: process.argv.slice(0, 20),
    };
}

export async function startBotRuntime(input = {}) {
    if (currentSocket || botState === "connected" || botState === "starting") {
        return { success: true, action: "start", alreadyRunning: true, state: botState };
    }
    if (input?.confirmed !== true) {
        return { success: false, action: "start", error: "Bot start requires explicit confirmation." };
    }
    if (typeof startHandler !== "function") {
        return { success: false, action: "start", error: "Bot start handler is not registered." };
    }
    shutdownInProgress = false;
    botState = "starting";
    try {
        await startHandler();
        return { success: true, action: "start", state: botState };
    } catch (error) {
        botState = "error";
        return { success: false, action: "start", error: error?.message || String(error) };
    }
}

export async function restartBotRuntime(input = {}) {
    if (input?.confirmed !== true) {
        return { success: false, action: "restart", error: "Bot restart requires explicit confirmation." };
    }
    if (typeof restartHandler !== "function") {
        return { success: false, action: "restart", error: "Bot restart handler is not registered." };
    }
    shutdownInProgress = false;
    botState = "restarting";
    try {
        await restartHandler();
        return { success: true, action: "restart", state: botState };
    } catch (error) {
        botState = "error";
        return { success: false, action: "restart", error: error?.message || String(error) };
    }
}

export async function shutdownBotRuntime(input = {}) {
    if (input?.confirmed !== true) {
        return { success: false, action: "shutdown", error: "Bot shutdown requires explicit confirmation." };
    }
    if (shutdownInProgress) return { success: true, action: "shutdown", alreadyInProgress: true };
    shutdownInProgress = true;
    botState = "stopping";
    const socket = currentSocket;
    try {
        if (socket?.ws && typeof socket.ws.close === "function") socket.ws.close();
        currentSocket = null;
        botState = "stopped";
        return { success: true, action: "shutdown", state: "stopped" };
    } catch (error) {
        botState = "error";
        return { success: false, action: "shutdown", error: error?.message || String(error) };
    }
}

export const botRuntimeConfig = {
    version: 2,
    controls: ["status", "health", "uptime", "memory", "process", "start", "restart", "shutdown"],
};
