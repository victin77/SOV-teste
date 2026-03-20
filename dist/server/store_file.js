"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileStore = createFileStore;
const node_crypto_1 = __importDefault(require("node:crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("./db");
const password_policy_1 = require("./password_policy");
function addAuditToDb(db, entry) {
    db.audit.push({
        id: node_crypto_1.default.randomUUID(),
        at: Date.now(),
        ...entry
    });
    if (db.audit.length > 2000)
        db.audit.splice(0, db.audit.length - 2000);
}
function leadIdKey(value) {
    return String(value ?? '').trim();
}
function findLeadIndexById(list, id) {
    const target = leadIdKey(id);
    if (!target)
        return -1;
    return list.findIndex((l) => leadIdKey(l && l.id) === target);
}
function getSeedMode() {
    const allowDefaultSeed = process.env.SOV_ALLOW_DEFAULT_SEED === '1';
    const isProd = process.env.NODE_ENV === 'production';
    return { allowDefaultSeed, isProd };
}
function getDefaultSeedUsers() {
    return [
        { user: 'admin', pass: 'admin123', role: 'admin' },
        { user: 'grazielle', pass: 'grazielle123', role: 'consultor' },
        { user: 'pedro', pass: 'pedro123', role: 'consultor' },
        { user: 'poli', pass: 'poli123', role: 'consultor' },
        { user: 'gustavo', pass: 'gustavo123', role: 'consultor' },
        { user: 'victor', pass: 'victor123', role: 'consultor' },
        { user: 'marcelo', pass: 'marcelo123', role: 'consultor' }
    ];
}
function ensureUsersSeededFile(db) {
    if (db.users.length > 0)
        return;
    const { allowDefaultSeed, isProd } = getSeedMode();
    const bootstrapUser = (process.env.SOV_BOOTSTRAP_ADMIN_USER || 'admin').trim().toLowerCase();
    const bootstrapPass = process.env.SOV_BOOTSTRAP_ADMIN_PASS;
    if (bootstrapPass) {
        if (isProd)
            (0, password_policy_1.assertStrongPassword)(bootstrapPass, 'bootstrap password', 4);
        db.users.push({
            user: bootstrapUser,
            role: 'admin',
            passHash: bcryptjs_1.default.hashSync(String(bootstrapPass), 10),
            createdAt: new Date().toISOString()
        });
        return;
    }
    if (allowDefaultSeed || !isProd) {
        const seed = getDefaultSeedUsers();
        db.users = seed.map((u) => ({
            user: u.user,
            role: u.role,
            passHash: bcryptjs_1.default.hashSync(u.pass, 10),
            createdAt: new Date().toISOString()
        }));
        return;
    }
    const tempPass = node_crypto_1.default.randomBytes(12).toString('base64url');
    db.users.push({
        user: bootstrapUser,
        role: 'admin',
        passHash: bcryptjs_1.default.hashSync(tempPass, 10),
        createdAt: new Date().toISOString()
    });
    // eslint-disable-next-line no-console
    console.log(`[BOOTSTRAP] Admin criado: ${bootstrapUser}`);
    // eslint-disable-next-line no-console
    console.log(`[BOOTSTRAP] Senha temporária: ${tempPass}`);
    // eslint-disable-next-line no-console
    console.log('[BOOTSTRAP] Defina SOV_BOOTSTRAP_ADMIN_PASS para fixar uma senha e crie usuários no app.');
}
function createFileStore() {
    return {
        kind: 'file',
        async init() {
            // no-op
        },
        async ensureUsersSeeded() {
            const db = (0, db_1.loadDb)();
            const before = db.users.length;
            ensureUsersSeededFile(db);
            if (db.users.length !== before)
                (0, db_1.saveDb)(db);
        },
        async getUser(username) {
            const db = (0, db_1.loadDb)();
            return db.users.find((u) => u.user === username) || null;
        },
        async listUsers() {
            const db = (0, db_1.loadDb)();
            return db.users.map((u) => ({ user: u.user, role: u.role, createdAt: u.createdAt }));
        },
        async createUser({ user, pass, role }) {
            const db = (0, db_1.loadDb)();
            const exists = db.users.some((u) => u.user === user);
            if (exists)
                return null;
            const next = {
                user,
                role,
                passHash: bcryptjs_1.default.hashSync(String(pass), 10),
                createdAt: new Date().toISOString()
            };
            db.users.push(next);
            (0, db_1.saveDb)(db);
            return { user: next.user, role: next.role, createdAt: next.createdAt };
        },
        async updateUser(user, updates) {
            const db = (0, db_1.loadDb)();
            const idx = db.users.findIndex((u) => u.user === user);
            if (idx === -1)
                return { ok: false, error: 'not_found' };
            const current = db.users[idx];
            const nextRole = updates && typeof updates.role === 'string' ? updates.role : current.role;
            const nextPass = updates && typeof updates.pass === 'string' && updates.pass.length > 0 ? updates.pass : '';
            if (current.role === 'admin' && nextRole !== 'admin') {
                const adminCount = db.users.filter((u) => u.role === 'admin').length;
                if (adminCount <= 1)
                    return { ok: false, error: 'last_admin' };
            }
            db.users[idx] = {
                ...current,
                role: nextRole,
                passHash: nextPass ? bcryptjs_1.default.hashSync(String(nextPass), 10) : current.passHash
            };
            (0, db_1.saveDb)(db);
            return {
                ok: true,
                user: {
                    user: db.users[idx].user,
                    role: db.users[idx].role,
                    createdAt: db.users[idx].createdAt
                }
            };
        },
        async deleteUser(user) {
            const db = (0, db_1.loadDb)();
            const idx = db.users.findIndex((u) => u.user === user);
            if (idx === -1)
                return { ok: false, error: 'not_found' };
            const target = db.users[idx];
            if (target.role === 'admin') {
                const adminCount = db.users.filter((u) => u.role === 'admin').length;
                if (adminCount <= 1)
                    return { ok: false, error: 'last_admin' };
            }
            db.users.splice(idx, 1);
            (0, db_1.saveDb)(db);
            return { ok: true };
        },
        async addAudit(entry) {
            const db = (0, db_1.loadDb)();
            addAuditToDb(db, entry);
            (0, db_1.saveDb)(db);
        },
        async listLeads() {
            const db = (0, db_1.loadDb)();
            return db.leads.filter((l) => !l.deleted);
        },
        async getLead(id) {
            const db = (0, db_1.loadDb)();
            const idx = findLeadIndexById(db.leads, id);
            return idx >= 0 ? db.leads[idx] : null;
        },
        async insertLead(storedLead, actor) {
            const db = (0, db_1.loadDb)();
            db.leads.push(storedLead);
            addAuditToDb(db, { actor, action: 'lead_create', entityType: 'lead', entityId: storedLead.id });
            (0, db_1.saveDb)(db);
            return storedLead;
        },
        async updateLead(id, storedLead, actor) {
            const db = (0, db_1.loadDb)();
            const idx = findLeadIndexById(db.leads, id);
            if (idx === -1)
                return null;
            db.leads[idx] = storedLead;
            addAuditToDb(db, { actor, action: 'lead_update', entityType: 'lead', entityId: id });
            (0, db_1.saveDb)(db);
            return storedLead;
        },
        async softDeleteLead(id, actor) {
            const db = (0, db_1.loadDb)();
            const idx = findLeadIndexById(db.leads, id);
            if (idx === -1)
                return false;
            db.leads[idx] = {
                ...db.leads[idx],
                deleted: true,
                updatedAt: Date.now(),
                lastModifiedBy: actor
            };
            addAuditToDb(db, { actor, action: 'lead_delete', entityType: 'lead', entityId: id });
            (0, db_1.saveDb)(db);
            return true;
        },
        async replaceLeads(nextLeads, actor) {
            const db = (0, db_1.loadDb)();
            db.leads = nextLeads;
            addAuditToDb(db, { actor, action: 'leads_replace', entityType: 'lead' });
            (0, db_1.saveDb)(db);
            return nextLeads.length;
        },
        async listAudit(limit) {
            const db = (0, db_1.loadDb)();
            const lim = Math.min(500, Math.max(1, Number(limit || 100)));
            return db.audit.slice(-lim).reverse();
        }
    };
}
