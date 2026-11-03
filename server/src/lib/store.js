// JSON file-backed persistent store with atomic writes and debounced flush.
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

let db = null;
let flushTimer = null;

function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function load() {
  if (db) return db;
  ensureDir(config.dataFile);
  if (fs.existsSync(config.dataFile)) {
    db = JSON.parse(fs.readFileSync(config.dataFile, "utf8"));
  } else {
    db = null; // caller must seed
  }
  return db;
}

export function init(seed) {
  ensureDir(config.dataFile);
  db = seed;
  flushNow();
  return db;
}

export function get() {
  if (!db) load();
  return db;
}

// Atomic write: write to temp then rename.
export function flushNow() {
  if (!db) return;
  const tmp = config.dataFile + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, config.dataFile);
}

// Debounced persist so bursts of writes don't thrash the disk.
export function persist() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushNow();
  }, 120);
}

/* ---------------- Tiny collection helpers ---------------- */
export const col = (name) => {
  const d = get();
  if (!d[name]) d[name] = [];
  return d[name];
};

export const findById = (name, id, key = "id") => col(name).find((x) => x[key] === id);

export const insert = (name, record) => {
  col(name).push(record);
  persist();
  return record;
};

export const update = (name, id, patch, key = "id") => {
  const rec = findById(name, id, key);
  if (!rec) return null;
  Object.assign(rec, patch);
  persist();
  return rec;
};

export const remove = (name, id, key = "id") => {
  const d = get();
  const before = d[name].length;
  d[name] = d[name].filter((x) => x[key] !== id);
  persist();
  return d[name].length < before;
};
