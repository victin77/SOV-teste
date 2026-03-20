"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadDb = loadDb;
exports.saveDb = saveDb;
exports.seedUsersIfEmpty = seedUsersIfEmpty;
const node_path_1 = __importDefault(require("node:path"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const storage_1 = require("./storage");
const DATA_DIR = node_path_1.default.join(process.cwd(), 'data');
const DB_PATH = node_path_1.default.join(DATA_DIR, 'db.json');
function defaultDb() {
    return {
        version: 1,
        createdAt: new Date().toISOString(),
        users: [],
        leads: [],
        audit: []
    };
}
function loadDb() {
    (0, storage_1.ensureDir)(DATA_DIR);
    const db = (0, storage_1.readJsonFile)(DB_PATH, defaultDb());
    if (!db || typeof db !== 'object')
        return defaultDb();
    if (!Array.isArray(db.users))
        db.users = [];
    if (!Array.isArray(db.leads))
        db.leads = [];
    if (!Array.isArray(db.audit))
        db.audit = [];
    if (!db.version)
        db.version = 1;
    return db;
}
function saveDb(db) {
    (0, storage_1.writeJsonAtomic)(DB_PATH, db);
}
function seedUsersIfEmpty(db) {
    if (db.users.length > 0)
        return false;
    const seed = [
        { user: 'admin', pass: 'admin123', role: 'admin' },
        { user: 'grazielle', pass: 'grazielle123', role: 'consultor' },
        { user: 'pedro', pass: 'pedro123', role: 'consultor' },
        { user: 'poli', pass: 'poli123', role: 'consultor' },
        { user: 'gustavo', pass: 'gustavo123', role: 'consultor' },
        { user: 'victor', pass: 'victor123', role: 'consultor' },
        { user: 'marcelo', pass: 'marcelo123', role: 'consultor' }
    ];
    db.users = seed.map((u) => ({
        user: u.user,
        role: u.role,
        passHash: bcryptjs_1.default.hashSync(u.pass, 10),
        createdAt: new Date().toISOString()
    }));
    return true;
}
