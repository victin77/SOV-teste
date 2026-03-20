"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isStrongPassword = isStrongPassword;
exports.assertStrongPassword = assertStrongPassword;
function normalizePassword(value) {
    return typeof value === 'string' ? value : String(value || '');
}
function isStrongPassword(value, minLength = 4) {
    const pass = normalizePassword(value);
    return pass.length >= minLength;
}
function assertStrongPassword(value, context = 'password', minLength = 4) {
    if (!isStrongPassword(value, minLength)) {
        throw new Error(`${context} must be at least ${minLength} chars.`);
    }
}
