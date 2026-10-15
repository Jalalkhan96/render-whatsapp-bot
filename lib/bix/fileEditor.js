import fs from "fs";
import path from "path";

const projectRoot = process.cwd();

export const pendingFileEdits = new Map();

export function getProjectRoot() {
    return projectRoot;
}

export function getCommandsPath() {
    // ABIX commands are loaded from these roots. The primary write/create
    // target is plugins/, while existing commands can be discovered in all roots.
    return path.join(projectRoot, "plugins");
}

export function getCommandRoots() {
    return [
        path.join(projectRoot, "plugins"),
        path.join(projectRoot, "plugins2"),
        path.join(projectRoot, "esportplugin"),
        path.join(projectRoot, "plugin4")
    ];
}

export function getBackupsPath() {
    return path.join(projectRoot, "data", "bix-backups");
}

export function isSafeFileName(name) {
    return typeof name === "string" && /^[a-zA-Z0-9_-]+$/.test(name);
}

export function getCommandFile(name) {
    if (!isSafeFileName(name)) return null;
    for (const root of getCommandRoots()) {
        const candidate = path.join(root, `${name}.js`);
        if (fs.existsSync(candidate)) return candidate;
        const disabled = `${candidate}.disabled`;
        if (fs.existsSync(disabled)) return candidate;
    }
    return path.join(getCommandsPath(), `${name}.js`);
}

export function backupFile(name, source) {
    const backupDir = getBackupsPath();
    fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safe = isSafeFileName(name) ? name : String(name || "file").replace(/[^a-zA-Z0-9_-]/g, "_");
    const backupPath = path.join(backupDir, `${safe}-${timestamp}.js`);
    fs.writeFileSync(backupPath, source, "utf8");
    return backupPath;
}

export function writeCommandFile(name, source) {
    if (!isSafeFileName(name)) throw new Error("Invalid command file name");
    const filePath = path.join(getCommandsPath(), `${name}.js`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, source, "utf8");
    return filePath;
}
