"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStore = createStore;
const store_file_1 = require("./store_file");
const store_pg_1 = require("./store_pg");
function createStore() {
    const usePg = process.env.SOV_DB === 'pg' ||
        process.env.SOV_DB === 'postgres' ||
        process.env.SOV_DB === 'postgresql' ||
        !!process.env.DATABASE_URL;
    return usePg ? (0, store_pg_1.createPgStore)() : (0, store_file_1.createFileStore)();
}
