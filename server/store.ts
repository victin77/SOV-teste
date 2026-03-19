import { createFileStore } from './store_file';
import { createPgStore } from './store_pg';

function createStore() {
  const usePg =
    process.env.SOV_DB === 'pg' ||
    process.env.SOV_DB === 'postgres' ||
    process.env.SOV_DB === 'postgresql' ||
    !!process.env.DATABASE_URL;

  return usePg ? createPgStore() : createFileStore();
}

export {
  createStore
};

