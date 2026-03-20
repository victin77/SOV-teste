"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const auth_1 = require("./auth");
const store_1 = require("./store");
const password_policy_1 = require("./password_policy");
const PORT = Number(process.env.PORT || 3000);
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SITE_STAGE = 'Leads do site';
const SITE_FORM_ACTOR = 'site_form';
const SITE_FORM_TOKEN = (process.env.SOV_SITE_FORM_TOKEN || '').trim();
const SITE_FORM_DEFAULT_ORIGIN = (process.env.SOV_SITE_LEADS_ORIGIN || 'Site Racon Consorcios').trim();
const SITE_FORM_RATE_LIMIT_MAX = Math.max(1, Number(process.env.SOV_SITE_FORM_RATE_LIMIT_MAX || 8));
const SITE_FORM_RATE_LIMIT_WINDOW_MS = Math.max(1000, Number(process.env.SOV_SITE_FORM_RATE_LIMIT_WINDOW_MS || (15 * 60 * 1000)));
const SITE_FORM_HONEYPOT_FIELD = (process.env.SOV_SITE_FORM_HONEYPOT_FIELD || 'company_website').trim();
const INTERNAL_LEADS_API_KEY = (process.env.CRM_API_KEY || '').trim();
const LOGIN_RATE_LIMIT_MAX = Math.max(1, Number(process.env.SOV_LOGIN_RATE_LIMIT_MAX || 5));
const LOGIN_RATE_LIMIT_WINDOW_MS = Math.max(1000, Number(process.env.SOV_LOGIN_RATE_LIMIT_WINDOW_MS || (15 * 60 * 1000)));
function isProduction() {
    return process.env.NODE_ENV === 'production';
}
function getSiteFormAllowedOrigins() {
    const raw = (process.env.SOV_SITE_FORM_ALLOWED_ORIGINS || '').trim();
    if (!raw)
        return isProduction() ? [] : ['*'];
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}
const SITE_FORM_ALLOWED_ORIGINS = getSiteFormAllowedOrigins();
const XLSX_BUNDLE = require.resolve('xlsx/dist/xlsx.full.min.js');
const app = (0, express_1.default)();
app.disable('x-powered-by');
app.use(express_1.default.json({ limit: '2mb' }));
const store = (0, store_1.createStore)();
const siteFormRateBuckets = new Map();
const loginRateBuckets = new Map();
function wrapAsync(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
function requireAdmin(req, res, next) {
    if (!req.auth || req.auth.role !== 'admin')
        return res.status(403).json({ error: 'forbidden' });
    next();
}
function requireWriter(req, res, next) {
    if (!req.auth || req.auth.role === 'leitura')
        return res.status(403).json({ error: 'forbidden' });
    next();
}
function authSafeStr(value, max = 500) {
    const raw = (value ?? '').toString().trim();
    return raw.length > max ? raw.slice(0, max) : raw;
}
function normalizeUserKey(value) {
    return authSafeStr(value, 60).toLowerCase();
}
function isSharedSiteLeadRecord(lead) {
    if (!lead || authSafeStr(lead.stage, 40) !== SITE_STAGE)
        return false;
    const owner = normalizeUserKey(lead.owner);
    if (!owner)
        return true;
    const createdAt = coerceEpochMs(lead.createdAt);
    const updatedAt = coerceEpochMs(lead.updatedAt);
    const lastModifiedBy = authSafeStr(lead.lastModifiedBy, 80).toLowerCase();
    return !!(createdAt && updatedAt && createdAt === updatedAt && lastModifiedBy.startsWith('site_form'));
}
function canViewLead(auth, lead) {
    if (!auth || !lead || lead.deleted)
        return false;
    if (auth.role === 'admin' || auth.role === 'leitura')
        return true;
    const me = normalizeUserKey(auth.user);
    if (!me)
        return false;
    const owner = normalizeUserKey(lead.owner);
    return owner === me || isSharedSiteLeadRecord(lead);
}
function canEditLead(auth, lead) {
    if (!auth || auth.role === 'leitura')
        return false;
    if (auth.role === 'admin')
        return true;
    return canViewLead(auth, lead);
}
function canDeleteLead(auth, lead) {
    if (!auth || auth.role === 'leitura')
        return false;
    if (auth.role === 'admin')
        return true;
    const me = normalizeUserKey(auth.user);
    const owner = normalizeUserKey(lead && lead.owner);
    return !!me && owner === me;
}
function applyLeadOwnershipRules(auth, existingLead, nextLead) {
    if (!auth || !nextLead)
        return nextLead;
    if (auth.role === 'admin')
        return nextLead;
    const me = normalizeUserKey(auth.user);
    if (!me)
        return { ...nextLead, owner: '' };
    const shouldClaimShared = existingLead && isSharedSiteLeadRecord(existingLead);
    return {
        ...nextLead,
        owner: shouldClaimShared ? me : me
    };
}
function validateRuntimeConfig() {
    if (!isProduction())
        return;
    const jwtSecret = (process.env.SOV_JWT_SECRET || '').trim();
    if (jwtSecret.length < 32) {
        throw new Error('SOV_JWT_SECRET deve ter ao menos 32 caracteres em producao.');
    }
    if (SITE_FORM_ALLOWED_ORIGINS.includes('*')) {
        throw new Error('SOV_SITE_FORM_ALLOWED_ORIGINS nao pode usar "*" em producao.');
    }
}
app.get('/api/ping', (req, res) => {
    res.json({ ok: true, time: Date.now() });
});
app.post('/api/auth/login', wrapAsync(async (req, res) => {
    const user = (req.body && req.body.user ? String(req.body.user) : '').trim().toLowerCase();
    const pass = req.body && typeof req.body.pass === 'string' ? req.body.pass : '';
    if (!user || !pass)
        return res.status(400).json({ error: 'missing_credentials' });
    const loginLimit = checkLoginRateLimit(req, user);
    if (!loginLimit.ok) {
        res.set('Retry-After', String(loginLimit.retryAfterSec));
        return res.status(429).json({ error: 'rate_limited', retryAfterSec: loginLimit.retryAfterSec });
    }
    await store.ensureUsersSeeded();
    const found = await store.getUser(user);
    if (!found)
        return res.status(401).json({ error: 'user_not_found' });
    const ok = bcryptjs_1.default.compareSync(pass, found.passHash);
    if (!ok)
        return res.status(401).json({ error: 'wrong_password' });
    const { token, expMs } = (0, auth_1.signToken)({ user, role: found.role, ttlMs: SESSION_TTL_MS });
    await store.addAudit({ actor: user, action: 'login', entityType: 'auth' });
    res.json({ user, role: found.role, token, exp: expMs });
}));
app.get('/api/auth/me', auth_1.authMiddleware, (req, res) => {
    const auth = req.auth;
    res.json({ user: auth.user, role: auth.role, exp: auth.exp });
});
app.post('/api/auth/logout', auth_1.authMiddleware, wrapAsync(async (req, res) => {
    await store.addAudit({ actor: req.auth.user, action: 'logout', entityType: 'auth' });
    res.json({ ok: true });
}));
app.get('/api/admin/users', auth_1.authMiddleware, requireAdmin, wrapAsync(async (req, res) => {
    const users = await store.listUsers();
    res.json({ users });
}));
app.post('/api/admin/users', auth_1.authMiddleware, requireAdmin, wrapAsync(async (req, res) => {
    const user = (req.body && req.body.user ? String(req.body.user) : '').trim().toLowerCase();
    const pass = req.body && typeof req.body.pass === 'string' ? req.body.pass : '';
    const roleRaw = (req.body && req.body.role ? String(req.body.role) : 'consultor').trim().toLowerCase();
    const role = ['admin', 'consultor', 'leitura'].includes(roleRaw) ? roleRaw : 'consultor';
    if (!user || !pass)
        return res.status(400).json({ error: 'missing_credentials' });
    if (user.length > 60)
        return res.status(400).json({ error: 'invalid_user' });
    if (!(0, password_policy_1.isStrongPassword)(pass, 4)) {
        return res.status(400).json({
            error: 'weak_password',
            details: 'Password must have at least 4 chars.'
        });
    }
    const created = await store.createUser({ user, pass, role });
    if (!created)
        return res.status(409).json({ error: 'user_exists' });
    await store.addAudit({ actor: req.auth.user, action: 'user_create', entityType: 'user', entityId: user });
    res.json({ user: created });
}));
app.put('/api/admin/users/:user', auth_1.authMiddleware, requireAdmin, wrapAsync(async (req, res) => {
    const target = (req.params && req.params.user ? String(req.params.user) : '').trim().toLowerCase();
    const pass = req.body && typeof req.body.pass === 'string' ? req.body.pass : '';
    const roleRaw = (req.body && req.body.role ? String(req.body.role) : '').trim().toLowerCase();
    const role = roleRaw ? (['admin', 'consultor', 'leitura'].includes(roleRaw) ? roleRaw : '') : '';
    if (!target || target.length > 60)
        return res.status(400).json({ error: 'invalid_user' });
    if (!role && !pass)
        return res.status(400).json({ error: 'missing_updates' });
    if (pass && !(0, password_policy_1.isStrongPassword)(pass, 4)) {
        return res.status(400).json({
            error: 'weak_password',
            details: 'Password must have at least 4 chars.'
        });
    }
    if (roleRaw && !role)
        return res.status(400).json({ error: 'invalid_role' });
    const result = await store.updateUser(target, { role: role || undefined, pass: pass || undefined });
    if (!result || result.error === 'not_found')
        return res.status(404).json({ error: 'user_not_found' });
    if (result.error === 'last_admin')
        return res.status(409).json({ error: 'last_admin' });
    await store.addAudit({ actor: req.auth.user, action: 'user_update', entityType: 'user', entityId: target });
    res.json({ user: result.user });
}));
app.delete('/api/admin/users/:user', auth_1.authMiddleware, requireAdmin, wrapAsync(async (req, res) => {
    const target = (req.params && req.params.user ? String(req.params.user) : '').trim().toLowerCase();
    if (!target)
        return res.status(400).json({ error: 'invalid_user' });
    if (target.length > 60)
        return res.status(400).json({ error: 'invalid_user' });
    if (target === req.auth.user)
        return res.status(400).json({ error: 'cannot_delete_self' });
    const result = await store.deleteUser(target);
    if (!result || result.error === 'not_found')
        return res.status(404).json({ error: 'user_not_found' });
    if (result.error === 'last_admin')
        return res.status(409).json({ error: 'last_admin' });
    await store.addAudit({ actor: req.auth.user, action: 'user_delete', entityType: 'user', entityId: target });
    res.json({ ok: true });
}));
function sanitizeLead(raw) {
    const safeStr = (v, max = 500) => {
        const s = (v ?? '').toString().trim();
        return s.length > max ? s.slice(0, max) : s;
    };
    const coerceEpochMs = (value) => {
        if (typeof value === 'number' && Number.isFinite(value))
            return value;
        if (typeof value === 'string' && value.trim()) {
            const ms = new Date(value).getTime();
            if (Number.isFinite(ms))
                return ms;
        }
        return null;
    };
    const tagsRaw = Array.isArray(raw.tags) ? raw.tags : [];
    const tags = Array.from(new Set(tagsRaw.map((t) => safeStr(t, 40).toLowerCase()).filter(Boolean))).slice(0, 20);
    const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
    const tasks = tasksRaw
        .filter((t) => t && typeof t === 'object')
        .slice(0, 200)
        .map((t) => ({ desc: safeStr(t.desc, 160), done: !!t.done, createdAt: coerceEpochMs(t.createdAt) }))
        .filter((t) => t.desc);
    return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : node_crypto_1.default.randomUUID(),
        name: safeStr(raw.name, 120),
        phone: safeStr(raw.phone, 30),
        origin: safeStr(raw.origin, 60) || 'Geral',
        value: Number(raw.value) || 0,
        nextStep: safeStr(raw.nextStep, 160),
        stage: safeStr(raw.stage, 40) || 'Novo lead',
        tasks,
        lossReason: safeStr(raw.lossReason, 60),
        obs: safeStr(raw.obs, 2000),
        owner: safeStr(raw.owner, 60),
        tags
    };
}
function parseSiteTags(raw) {
    const fromArray = Array.isArray(raw) ? raw : [];
    const fromString = typeof raw === 'string' ? raw.split(/[;,]/) : [];
    const list = fromArray.length ? fromArray : fromString;
    return Array.from(new Set(list.map((t) => (t ?? '').toString().trim().toLowerCase()).filter(Boolean))).slice(0, 20);
}
function sanitizeSiteFormPayload(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const safeStr = (v, max = 500) => {
        const s = (v ?? '').toString().trim();
        return s.length > max ? s.slice(0, max) : s;
    };
    const safePhone = (v) => safeStr(v, 30).replace(/[^\d+()\-\s]/g, '');
    const name = safeStr(input.name ?? input.nome, 120);
    const phone = safePhone(input.phone ?? input.telefone ?? input.celular);
    const email = safeStr(input.email, 120).toLowerCase();
    const origin = safeStr(input.origin ?? input.origem, 60) || SITE_FORM_DEFAULT_ORIGIN;
    const value = Number(input.value ?? input.valor) || 0;
    const nextStep = safeStr(input.nextStep ?? input.proximoPasso, 160) || 'Entrar em contato com lead do site';
    const message = safeStr(input.message ?? input.mensagem, 1200);
    const tags = parseSiteTags(input.tags);
    const knownKeys = new Set([
        'name', 'nome',
        'phone', 'telefone', 'celular',
        'email',
        'origin', 'origem',
        'value', 'valor',
        'nextStep', 'proximoPasso',
        'message', 'mensagem',
        'tags'
    ]);
    const extraFields = [];
    Object.entries(input).forEach(([key, valueRaw]) => {
        if (knownKeys.has(key))
            return;
        if (valueRaw === null || valueRaw === undefined)
            return;
        if (typeof valueRaw === 'object')
            return;
        const cleanKey = safeStr(key, 40);
        const cleanValue = safeStr(valueRaw, 220);
        if (!cleanKey || !cleanValue)
            return;
        extraFields.push({ key: cleanKey, value: cleanValue });
    });
    const obsParts = [];
    if (email)
        obsParts.push(`Email: ${email}`);
    if (message)
        obsParts.push(`Mensagem: ${message}`);
    if (extraFields.length) {
        obsParts.push('Campos adicionais do formulario:');
        extraFields.forEach((f) => {
            obsParts.push(`- ${f.key}: ${f.value}`);
        });
    }
    return {
        name,
        phone,
        email,
        origin,
        value,
        nextStep,
        tags,
        obs: obsParts.join('\n')
    };
}
function setSiteFormCorsHeaders(req, res) {
    const hasWildcard = SITE_FORM_ALLOWED_ORIGINS.includes('*');
    if (hasWildcard) {
        res.set('Access-Control-Allow-Origin', '*');
    }
    else {
        const origin = req.headers.origin ? String(req.headers.origin) : '';
        if (origin && SITE_FORM_ALLOWED_ORIGINS.includes(origin)) {
            res.set('Access-Control-Allow-Origin', origin);
            res.set('Vary', 'Origin');
        }
    }
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Site-Form-Token');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}
function isSiteFormOriginAllowed(req) {
    const hasWildcard = SITE_FORM_ALLOWED_ORIGINS.includes('*');
    if (hasWildcard)
        return true;
    const origin = req.headers.origin ? String(req.headers.origin) : '';
    return !!origin && SITE_FORM_ALLOWED_ORIGINS.includes(origin);
}
function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
        return xff.split(',')[0].trim();
    }
    if (Array.isArray(xff) && xff.length > 0) {
        return String(xff[0]).split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
}
function checkRateLimitBucket(bucketMap, key, max, windowMs) {
    const now = Date.now();
    if (bucketMap.size > 5000) {
        for (const [entryKey, bucket] of bucketMap.entries()) {
            if (!bucket || bucket.resetAt <= now)
                bucketMap.delete(entryKey);
        }
    }
    let bucket = bucketMap.get(key);
    if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
    }
    bucket.count += 1;
    bucketMap.set(key, bucket);
    if (bucket.count > max) {
        const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        return { ok: false, retryAfterSec };
    }
    return { ok: true, retryAfterSec: 0 };
}
function checkSiteFormRateLimit(req) {
    return checkRateLimitBucket(siteFormRateBuckets, getClientIp(req), SITE_FORM_RATE_LIMIT_MAX, SITE_FORM_RATE_LIMIT_WINDOW_MS);
}
function checkLoginRateLimit(req, user) {
    const key = `${getClientIp(req)}:${String(user || '').trim().toLowerCase()}`;
    return checkRateLimitBucket(loginRateBuckets, key, LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS);
}
function getBearerToken(req) {
    const authHeader = req.headers.authorization ? String(req.headers.authorization) : '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}
async function createLeadFromSitePayload(rawPayload, actor) {
    const payload = sanitizeSiteFormPayload(rawPayload || {});
    if (!payload.name)
        return { ok: false, code: 'missing_name', status: 400 };
    if (!payload.phone && !payload.email)
        return { ok: false, code: 'missing_contact', status: 400 };
    const owner = '';
    const lead = sanitizeLead({
        name: payload.name,
        phone: payload.phone,
        origin: payload.origin,
        value: payload.value,
        nextStep: payload.nextStep,
        stage: SITE_STAGE,
        tasks: [],
        lossReason: '',
        obs: payload.obs,
        owner,
        tags: payload.tags
    });
    const now = Date.now();
    const stored = {
        ...lead,
        stage: SITE_STAGE,
        owner,
        createdAt: now,
        updatedAt: now,
        deleted: false,
        lastModifiedBy: actor
    };
    const saved = await store.insertLead(stored, actor);
    return { ok: true, saved };
}
app.post('/internal/leads', wrapAsync(async (req, res) => {
    if (!INTERNAL_LEADS_API_KEY) {
        return res.status(503).json({ error: 'internal_leads_not_configured' });
    }
    const incomingToken = getBearerToken(req);
    if (!incomingToken || incomingToken !== INTERNAL_LEADS_API_KEY) {
        return res.status(401).json({ error: 'invalid_token' });
    }
    const result = await createLeadFromSitePayload(req.body || {}, `${SITE_FORM_ACTOR}_internal`);
    if (!result.ok)
        return res.status(result.status).json({ error: result.code });
    res.status(201).json({ ok: true });
}));
app.options('/api/public/site-leads', (req, res) => {
    setSiteFormCorsHeaders(req, res);
    res.status(204).end();
});
app.options('/api/public/site-form-submit', (req, res) => {
    setSiteFormCorsHeaders(req, res);
    res.status(204).end();
});
app.post('/api/public/site-form-submit', wrapAsync(async (req, res) => {
    setSiteFormCorsHeaders(req, res);
    if (!isSiteFormOriginAllowed(req)) {
        return res.status(403).json({ error: 'invalid_origin' });
    }
    const honeypot = req.body && SITE_FORM_HONEYPOT_FIELD ? req.body[SITE_FORM_HONEYPOT_FIELD] : '';
    if (honeypot && String(honeypot).trim()) {
        // Resposta neutra para reduzir feedback para bots.
        return res.status(202).json({ ok: true });
    }
    const limit = checkSiteFormRateLimit(req);
    if (!limit.ok) {
        res.set('Retry-After', String(limit.retryAfterSec));
        return res.status(429).json({ error: 'rate_limited', retryAfterSec: limit.retryAfterSec });
    }
    const result = await createLeadFromSitePayload(req.body || {}, `${SITE_FORM_ACTOR}_browser`);
    if (!result.ok)
        return res.status(result.status).json({ error: result.code });
    res.status(201).json({ ok: true });
}));
app.post('/api/public/site-leads', wrapAsync(async (req, res) => {
    setSiteFormCorsHeaders(req, res);
    if (SITE_FORM_TOKEN) {
        const incomingToken = req.headers['x-site-form-token'] ? String(req.headers['x-site-form-token']).trim() : '';
        if (incomingToken !== SITE_FORM_TOKEN)
            return res.status(403).json({ error: 'invalid_site_form_token' });
    }
    const result = await createLeadFromSitePayload(req.body || {}, SITE_FORM_ACTOR);
    if (!result.ok)
        return res.status(result.status).json({ error: result.code });
    res.status(201).json({ ok: true, lead: result.saved });
}));
app.get('/api/leads', auth_1.authMiddleware, wrapAsync(async (req, res) => {
    const leads = await store.listLeads();
    const visibleLeads = leads.filter((lead) => canViewLead(req.auth, lead));
    res.json({ leads: visibleLeads });
}));
app.post('/api/leads', auth_1.authMiddleware, requireWriter, wrapAsync(async (req, res) => {
    const lead = sanitizeLead(req.body || {});
    if (!lead.name)
        return res.status(400).json({ error: 'missing_name' });
    const now = Date.now();
    const stored = applyLeadOwnershipRules(req.auth, null, {
        ...lead,
        createdAt: now,
        updatedAt: now,
        deleted: false,
        lastModifiedBy: req.auth.user
    });
    const saved = await store.insertLead(stored, req.auth.user);
    res.json({ lead: saved });
}));
app.put('/api/leads/:id', auth_1.authMiddleware, requireWriter, wrapAsync(async (req, res) => {
    const id = req.params.id;
    const existing = await store.getLead(id);
    if (!existing || existing.deleted)
        return res.status(404).json({ error: 'not_found' });
    if (!canEditLead(req.auth, existing))
        return res.status(403).json({ error: 'forbidden' });
    const next = sanitizeLead({ ...existing, ...(req.body || {}), id });
    if (!next.name)
        return res.status(400).json({ error: 'missing_name' });
    const now = Date.now();
    const updated = applyLeadOwnershipRules(req.auth, existing, {
        ...existing,
        ...next,
        updatedAt: now,
        lastModifiedBy: req.auth.user
    });
    const saved = await store.updateLead(id, updated, req.auth.user);
    if (!saved)
        return res.status(404).json({ error: 'not_found' });
    res.json({ lead: saved });
}));
app.delete('/api/leads/:id', auth_1.authMiddleware, requireWriter, wrapAsync(async (req, res) => {
    const id = req.params.id;
    const existing = await store.getLead(id);
    if (!existing)
        return res.status(404).json({ error: 'not_found' });
    if (!canDeleteLead(req.auth, existing))
        return res.status(403).json({ error: 'forbidden' });
    const ok = await store.softDeleteLead(id, req.auth.user);
    if (!ok)
        return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
}));
app.post('/api/leads/replace', auth_1.authMiddleware, requireAdmin, wrapAsync(async (req, res) => {
    const incoming = req.body && Array.isArray(req.body.leads) ? req.body.leads : null;
    if (!incoming)
        return res.status(400).json({ error: 'missing_leads' });
    const sanitized = [];
    const ids = new Set();
    for (let i = 0; i < incoming.length; i++) {
        const lead = sanitizeLead(incoming[i] || {});
        if (!lead.name)
            continue;
        let id = lead.id;
        while (ids.has(id))
            id = node_crypto_1.default.randomUUID();
        ids.add(id);
        const now = Date.now();
        sanitized.push({
            ...lead,
            id,
            createdAt: typeof incoming[i].createdAt === 'number' ? incoming[i].createdAt : now,
            updatedAt: now,
            deleted: false,
            lastModifiedBy: req.auth.user
        });
    }
    const count = await store.replaceLeads(sanitized, req.auth.user);
    res.json({ ok: true, count });
}));
app.get('/api/audit', auth_1.authMiddleware, requireAdmin, wrapAsync(async (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
    const items = await store.listAudit(limit);
    res.json({ audit: items });
}));
// Serve front-end
const ROOT = process.cwd();
// Do not expose private folders/files via static hosting
const STATIC_BLOCK_PREFIXES = ['/data', '/server', '/node_modules'];
const STATIC_BLOCK_PATHS = new Set(['/package.json', '/package-lock.json', '/.gitignore']);
app.use((req, res, next) => {
    const p = req.path || '';
    if (STATIC_BLOCK_PATHS.has(p) || STATIC_BLOCK_PREFIXES.some((pref) => p === pref || p.startsWith(`${pref}/`))) {
        return res.status(404).end();
    }
    next();
});
app.get('/', (req, res) => {
    res.sendFile(node_path_1.default.join(ROOT, 'login.html'));
});
app.get('/vendor/xlsx.full.min.js', (req, res) => {
    res.sendFile(XLSX_BUNDLE);
});
app.use(express_1.default.static(ROOT, { index: false }));
app.use((err, req, res, next) => {
    // eslint-disable-next-line no-console
    console.error(err);
    if (res.headersSent)
        return next(err);
    res.status(500).json({ error: 'internal_error' });
});
async function start() {
    validateRuntimeConfig();
    await store.init();
    // eslint-disable-next-line no-console
    console.log(`SOV CRM store: ${store.kind}`);
    app.listen(PORT, () => {
        // eslint-disable-next-line no-console
        console.log(`SOV CRM running on http://localhost:${PORT}`);
    });
}
start().catch((e) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', e);
    process.exit(1);
});
