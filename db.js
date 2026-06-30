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
    created_at INTEGER NOT NULL,
    native_lang TEXT DEFAULT 'zh-CN',
    target_lang TEXT DEFAULT 'en-US'
  );
  CREATE TABLE IF NOT EXISTS words (
    user_id TEXT NOT NULL REFERENCES users(id),
    word TEXT NOT NULL,
    lang TEXT NOT NULL DEFAULT 'en-US',
    cn TEXT,
    ipa TEXT,
    note TEXT,
    seen INTEGER DEFAULT 0,
    correct INTEGER DEFAULT 0,
    wrong INTEGER DEFAULT 0,
    removed INTEGER DEFAULT 0,
    total_time INTEGER DEFAULT 0,
    mastery REAL DEFAULT 0,
    PRIMARY KEY(user_id, word, lang)
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

for (const col of ["username", "password_hash", "native_lang", "target_lang"]) {
  try { db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT`); } catch {}
}

// 迁移：旧 words 表 PK 为 (user_id, word)，需改为 (user_id, word, lang)
const wordsCols = db.prepare("PRAGMA table_info(words)").all();
const hasLangCol = wordsCols.some(c => c.name === "lang");
const needsMigration = !hasLangCol || wordsCols.filter(c => c.pk).length < 3;

if (needsMigration) {
  try {
    // 先尝试加列（可能已加过）
    if (!hasLangCol) db.exec("ALTER TABLE words ADD COLUMN lang TEXT DEFAULT 'en-US'");
    // 重建表以修正 PK
    db.exec("DROP TABLE IF EXISTS words_migrate");
    db.exec(`
      CREATE TABLE words_migrate (
        user_id TEXT NOT NULL REFERENCES users(id),
        word TEXT NOT NULL,
        lang TEXT NOT NULL DEFAULT 'en-US',
        cn TEXT,
        ipa TEXT,
        note TEXT,
        seen INTEGER DEFAULT 0,
        correct INTEGER DEFAULT 0,
        wrong INTEGER DEFAULT 0,
        removed INTEGER DEFAULT 0,
        total_time INTEGER DEFAULT 0,
        mastery REAL DEFAULT 0,
        PRIMARY KEY(user_id, word, lang)
      );
      INSERT OR IGNORE INTO words_migrate SELECT user_id, word, COALESCE(lang, 'en-US'), cn, ipa, note, seen, correct, wrong, removed, total_time, mastery FROM words;
      DROP TABLE words;
      ALTER TABLE words_migrate RENAME TO words;
    `);
  } catch (e) {
    console.error("DB migration failed:", e.message);
  }
}

db.exec("UPDATE words SET mastery = ROUND(mastery, 2) WHERE mastery != ROUND(mastery, 2)");

const stmGetUser = db.prepare("SELECT * FROM users WHERE id = ?");
const stmGetUserByUsername = db.prepare("SELECT * FROM users WHERE username = ?");
const stmInsertUser = db.prepare(
  "INSERT INTO users (id, username, password_hash, level, total_sentences, created_at, native_lang, target_lang) VALUES (?, ?, ?, 1, 0, ?, ?, ?)"
);
const stmUpsertUser = db.prepare(
  "INSERT INTO users (id, username, password_hash, level, total_sentences, created_at, native_lang, target_lang) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET level = excluded.level, total_sentences = excluded.total_sentences, native_lang = excluded.native_lang, target_lang = excluded.target_lang"
);
const stmGetWords = db.prepare("SELECT * FROM words WHERE user_id = ?");
const stmGetWordsByLang = db.prepare("SELECT * FROM words WHERE user_id = ? AND lang = ?");
const stmUpsertWord = db.prepare(
  "INSERT INTO words (user_id, word, lang, cn, ipa, note, seen, correct, wrong, removed, total_time, mastery) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, word, lang) DO UPDATE SET cn = excluded.cn, ipa = excluded.ipa, note = excluded.note, seen = excluded.seen, correct = excluded.correct, wrong = excluded.wrong, removed = excluded.removed, total_time = excluded.total_time, mastery = excluded.mastery"
);
const stmAddResult = db.prepare(
  "INSERT INTO results (user_id, correct, total, avg_time_ms, created_at) VALUES (?, ?, ?, ?, ?)"
);
const stmRecentResults = db.prepare(
  "SELECT * FROM results WHERE user_id = ? ORDER BY id DESC LIMIT 20"
);
const stmTotalScore = db.prepare(
  "SELECT COALESCE(SUM(mastery), 0) AS score FROM words WHERE user_id = ? AND lang = ?"
);
const stmTotalScoreAll = db.prepare(
  "SELECT COALESCE(SUM(mastery), 0) AS score FROM words WHERE user_id = ?"
);
const stmUserCount = db.prepare("SELECT COUNT(*) AS count FROM users");

export function createUser(username, passwordHash, nativeLang, targetLang) {
  const id = crypto.randomUUID();
  stmInsertUser.run(id, username, passwordHash, Date.now(), nativeLang || "zh-CN", targetLang || "en-US");
  return { id, username, level: 1, totalSentences: 0, totalScore: 0, wordFamiliarity: {}, recentResults: [], nativeLang: nativeLang || "zh-CN", targetLang: targetLang || "en-US" };
}

function loadWords(userId, lang) {
  const words = {};
  const rows = lang ? stmGetWordsByLang.all(userId, lang) : stmGetWords.all(userId);
  for (const w of rows) {
    words[w.word] = {
      seen: w.seen, correct: w.correct, wrong: w.wrong, removed: w.removed,
      totalTime: w.total_time, mastery: w.mastery,
      cn: w.cn, ipa: w.ipa, note: w.note,
    };
  }
  return words;
}

export function findUserByUsername(username) {
  const u = stmGetUserByUsername.get(username);
  if (!u) return null;
  const recent = stmRecentResults.all(u.id).map(r => ({
    correct: r.correct, total: r.total, avgTimeMs: r.avg_time_ms,
  }));
  const totalScore = stmTotalScoreAll.get(u.id).score;
  return {
    id: u.id, username: u.username, level: u.level,
    totalSentences: u.total_sentences, totalScore,
    wordFamiliarity: {}, recentResults: recent,
    passwordHash: u.password_hash,
    nativeLang: u.native_lang || "zh-CN",
    targetLang: u.target_lang || "en-US",
  };
}

export function ensureUser(userId, lang) {
  const u = stmGetUser.get(userId);
  if (!u) {
    stmUpsertUser.run(userId, null, null, 1, 0, Date.now(), "zh-CN", "en-US");
    return { level: 1, totalSentences: 0, totalScore: 0, wordFamiliarity: {}, recentResults: [], nativeLang: "zh-CN", targetLang: "en-US" };
  }
  const words = loadWords(userId, lang || null);
  const recent = stmRecentResults.all(userId).map(r => ({
    correct: r.correct, total: r.total, avgTimeMs: r.avg_time_ms,
  }));
  const totalScore = lang ? stmTotalScore.get(userId, lang).score : stmTotalScoreAll.get(userId).score;
  return { level: u.level, totalSentences: u.total_sentences, totalScore, wordFamiliarity: words, recentResults: recent, nativeLang: u.native_lang || "zh-CN", targetLang: u.target_lang || "en-US" };
}

export function saveUser(userId, data) {
  stmUpsertUser.run(userId, null, null, data.level, data.totalSentences, Date.now(), data.nativeLang || null, data.targetLang || null);
}

export function saveWord(userId, word, lang, f) {
  stmUpsertWord.run(
    userId, word, lang || "en-US", f.cn || null, f.ipa || null, f.note || null,
    f.seen || 0, f.correct || 0, f.wrong || 0, f.removed || 0,
    f.totalTime || 0, f.mastery ?? 0
  );
}

export function addResult(userId, correct, total, avgTimeMs) {
  stmAddResult.run(userId, correct, total, avgTimeMs, Date.now());
}

export function getUserCount() {
  return stmUserCount.get().count;
}
