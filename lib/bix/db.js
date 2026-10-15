import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const STORE_ROOT = path.join(ROOT, "data", "bix-db");

function safeCollection(name) {
    const value = String(name || "").trim();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new Error("Invalid collection name.");
    return value;
}

function filePath(collection) {
    const safe = safeCollection(collection);
    fs.mkdirSync(STORE_ROOT, { recursive: true });
    return path.join(STORE_ROOT, `${safe}.json`);
}

function readCollection(collection) {
    const file = filePath(collection);
    try {
        const raw = JSON.parse(fs.readFileSync(file, "utf8"));
        return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch {
        return {};
    }
}

function writeCollection(collection, data) {
    const file = filePath(collection);
    const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(temp, file);
}

export async function getDoc(collectionName, id) {
    const collection = readCollection(collectionName);
    const key = String(id || "");
    const value = collection[key];
    if (!value) return null;
    return JSON.parse(JSON.stringify(value));
}

export async function setDoc(collectionName, id, data) {
    const collection = readCollection(collectionName);
    const key = String(id || "");
    if (!key) throw new Error("Document id is required.");
    collection[key] = { ...(data && typeof data === "object" ? data : {}), _id: key };
    writeCollection(collectionName, collection);
    return JSON.parse(JSON.stringify(collection[key]));
}

export async function deleteDoc(collectionName, id) {
    const collection = readCollection(collectionName);
    const key = String(id || "");
    const existed = Object.prototype.hasOwnProperty.call(collection, key);
    delete collection[key];
    writeCollection(collectionName, collection);
    return { deleted: existed };
}
