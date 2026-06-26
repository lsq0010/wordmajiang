import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, ".userdata.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password_hash TEXT,
    level INTEGER DEFAULT 1,
    total_sentences INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS words (
    user_id TEXT NOT NULL REFERENCES users(id),
    word TEXT NOT NULL,
    cn TEXT,
    ipa TEXT,
    note TEXT,
    seen INTEGER DEFAULT 0,
    correct INTEGER DEFAULT 0,
    wrong INTEGER DEFAULT 0,
    removed INTEGER DEFAULT 0,
    total_time INTEGER DEFAULT 0,
    mastery REAL DEFAULT 0,
    PRIMARY KEY(user_id, word)
  );
  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    correct INTEGER NOT NULL,
    total INTEGER NOT NULL,
    avg_time_ms REAL NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

// 兼容旧表：尝试加列
for (const col of ["username", "password_hash"]) {
  try { db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT`); } catch {}
}

// 修复浮点数精度：将已有 mastery 四舍五入到 2 位小数
db.exec("UPDATE words SET mastery = ROUND(mastery, 2) WHERE mastery != ROUND(mastery, 2)");

// prepared statements
const stmGetUser = db.prepare("SELECT * FROM users WHERE id = ?");
const stmGetUserByUsername = db.prepare("SELECT * FROM users WHERE username = ?");
const stmInsertUser = db.prepare(
  "INSERT INTO users (id, username, password_hash, level, total_sentences, created_at) VALUES (?, ?, ?, 1, 0, ?)"
);
const stmUpsertUser = db.prepare(
  "INSERT INTO users (id, username, password_hash, level, total_sentences, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET level = excluded.level, total_sentences = excluded.total_sentences"
);
const stmGetWords = db.prepare("SELECT * FROM words WHERE user_id = ?");
const stmUpsertWord = db.prepare(
  "INSERT INTO words (user_id, word, cn, ipa, note, seen, correct, wrong, removed, total_time, mastery) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, word) DO UPDATE SET cn = excluded.cn, ipa = excluded.ipa, note = excluded.note, seen = excluded.seen, correct = excluded.correct, wrong = excluded.wrong, removed = excluded.removed, total_time = excluded.total_time, mastery = excluded.mastery"
);
const stmAddResult = db.prepare(
  "INSERT INTO results (user_id, correct, total, avg_time_ms, created_at) VALUES (?, ?, ?, ?, ?)"
);
const stmRecentResults = db.prepare(
  "SELECT * FROM results WHERE user_id = ? ORDER BY id DESC LIMIT 20"
);
const stmTotalScore = db.prepare(
  "SELECT COALESCE(SUM(mastery), 0) AS score FROM words WHERE user_id = ?"
);
const stmUserCount = db.prepare("SELECT COUNT(*) AS count FROM users");

export function createUser(username, passwordHash) {
  const id = crypto.randomUUID();
  stmInsertUser.run(id, username, passwordHash, Date.now());
  return { id, username, level: 1, totalSentences: 0, totalScore: 0, wordFamiliarity: {}, recentResults: [] };
}

export function findUserByUsername(username) {
  const u = stmGetUserByUsername.get(username);
  if (!u) return null;
  const words = {};
  for (const w of stmGetWords.all(u.id)) {
    words[w.word] = {
      seen: w.seen, correct: w.correct, wrong: w.wrong, removed: w.removed,
      totalTime: w.total_time, mastery: w.mastery,
      cn: w.cn, ipa: w.ipa, note: w.note,
    };
  }
  const recent = stmRecentResults.all(u.id).map(r => ({
    correct: r.correct, total: r.total, avgTimeMs: r.avg_time_ms,
  }));
  const totalScore = stmTotalScore.get(u.id).score;
  return {
    id: u.id, username: u.username, level: u.level,
    totalSentences: u.total_sentences, totalScore,
    wordFamiliarity: words, recentResults: recent,
    passwordHash: u.password_hash,
  };
}

export function ensureUser(userId) {
  const u = stmGetUser.get(userId);
  if (!u) {
    stmUpsertUser.run(userId, null, null, 1, 0, Date.now());
    return { level: 1, totalSentences: 0, totalScore: 0, wordFamiliarity: {}, recentResults: [] };
  }
  const words = {};
  for (const w of stmGetWords.all(userId)) {
    words[w.word] = {
      seen: w.seen, correct: w.correct, wrong: w.wrong, removed: w.removed,
      totalTime: w.total_time, mastery: w.mastery,
      cn: w.cn, ipa: w.ipa, note: w.note,
    };
  }
  const recent = stmRecentResults.all(userId).map(r => ({
    correct: r.correct, total: r.total, avgTimeMs: r.avg_time_ms,
  }));
  const totalScore = stmTotalScore.get(userId).score;
  return { level: u.level, totalSentences: u.total_sentences, totalScore, wordFamiliarity: words, recentResults: recent };
}

export function saveUser(userId, data) {
  stmUpsertUser.run(userId, null, null, data.level, data.totalSentences, Date.now());
}

export function saveWord(userId, word, f) {
  stmUpsertWord.run(
    userId, word, f.cn || null, f.ipa || null, f.note || null,
    f.seen || 0, f.correct || 0, f.wrong || 0, f.removed || 0,
    f.totalTime || 0, f.mastery ?? 0
  );
}

export function addResult(userId, correct, total, avgTimeMs) {
  stmAddResult.run(userId, correct, total, avgTimeMs, Date.now());
}

export function getRecentResults(userId) {
  return stmRecentResults.all(userId).map(r => ({
    correct: r.correct, total: r.total, avgTimeMs: r.avg_time_ms,
  }));
}

export function getUserCount() {
  return stmUserCount.get().count;
}

export default db;
