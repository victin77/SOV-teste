"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDir = ensureDir;
exports.readJsonFile = readJsonFile;
exports.writeJsonAtomic = writeJsonAtomic;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function ensureDir(dirPath) {
    node_fs_1.default.mkdirSync(dirPath, { recursive: true });
}
function readJsonFile(filePath, fallback) {
    try {
        const raw = node_fs_1.default.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
function writeJsonAtomic(filePath, data) {
    ensureDir(node_path_1.default.dirname(filePath));
    const tmpPath = `${filePath}.tmp`;
    node_fs_1.default.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    node_fs_1.default.renameSync(tmpPath, filePath);
}
