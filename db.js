import pkg from "pg";
const { Pool } = pkg;

let pool;

function getPool() {
  if (!pool) throw new Error("DB not initialized");
  return pool;
}

async function ensureTables() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      password_hash TEXT,
      level INTEGER DEFAULT 1,
      total_sentences INTEGER DEFAULT 0,
      created_at BIGINT NOT NULL
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
      mastery DOUBLE PRECISION DEFAULT 0,
      PRIMARY KEY(user_id, word)
    );
    CREATE TABLE IF NOT EXISTS results (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      correct INTEGER NOT NULL,
      total INTEGER NOT NULL,
      avg_time_ms DOUBLE PRECISION NOT NULL,
      created_at BIGINT NOT NULL
    );
  `);
}

export async function initDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not configured");
  const url = new URL(dbUrl);
  console.log(`DB connecting: ${url.username}@${url.hostname}:${url.port}${url.pathname}`);
  pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  pool.on("error", (e) => console.error("DB pool error:", e.message));
  await ensureTables();
}

export async function createUser(username, passwordHash) {
  const id = crypto.randomUUID();
  await getPool().query(
    "INSERT INTO users (id, username, password_hash, level, total_sentences, created_at) VALUES ($1, $2, $3, 1, 0, $4)",
    [id, username, passwordHash, Date.now()]
  );
  return { id, username, level: 1, totalSentences: 0, totalScore: 0, wordFamiliarity: {}, recentResults: [] };
}

export async function findUserByUsername(username) {
  const { rows } = await getPool().query("SELECT * FROM users WHERE username = $1", [username]);
  const u = rows[0];
  if (!u) return null;
  const { rows: wrows } = await getPool().query("SELECT * FROM words WHERE user_id = $1", [u.id]);
  const words = {};
  for (const w of wrows) {
    words[w.word] = {
      seen: w.seen, correct: w.correct, wrong: w.wrong, removed: w.removed,
      totalTime: w.total_time, mastery: w.mastery,
      cn: w.cn, ipa: w.ipa, note: w.note,
    };
  }
  const { rows: rrows } = await getPool().query(
    "SELECT * FROM results WHERE user_id = $1 ORDER BY id DESC LIMIT 20", [u.id]
  );
  const recent = rrows.map(r => ({
    correct: r.correct, total: r.total, avgTimeMs: r.avg_time_ms,
  }));
  const { rows: srows } = await getPool().query(
    "SELECT COALESCE(SUM(mastery), 0) AS score FROM words WHERE user_id = $1", [u.id]
  );
  return {
    id: u.id, username: u.username, level: u.level,
    totalSentences: u.total_sentences, totalScore: Number(srows[0].score),
    wordFamiliarity: words, recentResults: recent,
    passwordHash: u.password_hash,
  };
}

export async function ensureUser(userId) {
  const { rows } = await getPool().query("SELECT * FROM users WHERE id = $1", [userId]);
  const u = rows[0];
  if (!u) {
    await getPool().query(
      "INSERT INTO users (id, username, password_hash, level, total_sentences, created_at) VALUES ($1, NULL, NULL, 1, 0, $2) ON CONFLICT(id) DO NOTHING",
      [userId, Date.now()]
    );
    return { level: 1, totalSentences: 0, totalScore: 0, wordFamiliarity: {}, recentResults: [] };
  }
  const { rows: wrows } = await getPool().query("SELECT * FROM words WHERE user_id = $1", [userId]);
  const words = {};
  for (const w of wrows) {
    words[w.word] = {
      seen: w.seen, correct: w.correct, wrong: w.wrong, removed: w.removed,
      totalTime: w.total_time, mastery: w.mastery,
      cn: w.cn, ipa: w.ipa, note: w.note,
    };
  }
  const { rows: rrows } = await getPool().query(
    "SELECT * FROM results WHERE user_id = $1 ORDER BY id DESC LIMIT 20", [userId]
  );
  const recent = rrows.map(r => ({
    correct: r.correct, total: r.total, avgTimeMs: r.avg_time_ms,
  }));
  const { rows: srows } = await getPool().query(
    "SELECT COALESCE(SUM(mastery), 0) AS score FROM words WHERE user_id = $1", [userId]
  );
  return {
    level: u.level, totalSentences: u.total_sentences,
    totalScore: Number(srows[0].score), wordFamiliarity: words, recentResults: recent,
  };
}

export async function saveUser(userId, data) {
  await getPool().query(
    "INSERT INTO users (id, username, password_hash, level, total_sentences, created_at) VALUES ($1, NULL, NULL, $2, $3, $4) ON CONFLICT(id) DO UPDATE SET level = EXCLUDED.level, total_sentences = EXCLUDED.total_sentences",
    [userId, data.level, data.totalSentences, Date.now()]
  );
}

export async function saveWord(userId, word, f) {
  await getPool().query(
    `INSERT INTO words (user_id, word, cn, ipa, note, seen, correct, wrong, removed, total_time, mastery)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT(user_id, word) DO UPDATE SET
       cn = EXCLUDED.cn, ipa = EXCLUDED.ipa, note = EXCLUDED.note,
       seen = EXCLUDED.seen, correct = EXCLUDED.correct, wrong = EXCLUDED.wrong,
       removed = EXCLUDED.removed, total_time = EXCLUDED.total_time, mastery = EXCLUDED.mastery`,
    [userId, word, f.cn || null, f.ipa || null, f.note || null,
     f.seen || 0, f.correct || 0, f.wrong || 0, f.removed || 0,
     f.totalTime || 0, f.mastery ?? 0]
  );
}

export async function addResult(userId, correct, total, avgTimeMs) {
  await getPool().query(
    "INSERT INTO results (user_id, correct, total, avg_time_ms, created_at) VALUES ($1, $2, $3, $4, $5)",
    [userId, correct, total, avgTimeMs, Date.now()]
  );
}

export async function getUserCount() {
  const { rows } = await getPool().query("SELECT COUNT(*) AS count FROM users");
  return Number(rows[0].count);
}
