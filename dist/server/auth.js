"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.authMiddleware = authMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function isProduction() {
    return process.env.NODE_ENV === 'production';
}
function getJwtSecret() {
    const secret = (process.env.SOV_JWT_SECRET || '').trim();
    if (secret.length >= 32)
        return secret;
    if (isProduction()) {
        throw new Error('SOV_JWT_SECRET deve ter ao menos 32 caracteres em producao.');
    }
    return 'dev-secret-change-me-please-32chars';
}
function signToken({ user, role, ttlMs }) {
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + Math.floor(ttlMs / 1000);
    const token = jsonwebtoken_1.default.sign({ sub: user, role, iat: nowSec, exp: expSec }, getJwtSecret());
    return { token, expMs: expSec * 1000 };
}
function authMiddleware(req, res, next) {
    const header = req.headers.authorization || '';
    const [, token] = header.split(' ');
    if (!token)
        return res.status(401).json({ error: 'missing_token' });
    try {
        const payload = jsonwebtoken_1.default.verify(token, getJwtSecret());
        req.auth = { user: payload.sub, role: payload.role, exp: Number(payload.exp || 0) * 1000 };
        next();
    }
    catch {
        return res.status(401).json({ error: 'invalid_token' });
    }
}
