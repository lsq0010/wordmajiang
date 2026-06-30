import express from "express";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { charBank } from "./chars.js";
import { ensureUser, saveUser, saveWord, addResult, createUser, findUserByUsername, getUserCount } from "./db.js";
import { hashPassword, comparePassword, signToken, requireAuth } from "./auth.js";

dotenv.config({ override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "client", "dist")));

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
const round2 = (n) => Math.round(n * 100) / 100;

// 句子缓存：userId → 预生成的回合数组
const sentenceCache = new Map();

// ========== 认证路由 ==========

app.post("/api/auth/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || typeof username !== "string" || username.trim().length < 3 || username.trim().length > 20) {
    return res.status(400).json({ error: "Username must be 3-20 characters" });
  }
  const pwd = password.trim();
  if (!pwd || typeof pwd !== "string" || pwd.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  const u = findUserByUsername(username.trim());
  if (u) return res.status(409).json({ error: "Username already taken" });
  const hash = hashPassword(pwd);
  const user = createUser(username.trim(), hash);
  const token = signToken(user.id);
  res.json({ token, user: { id: user.id, username: user.username, level: user.level } });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  const u = findUserByUsername(username.trim());
  try { const c = getUserCount(); console.log(`LOGIN: user="${username.trim()}" found=${!!u} totalUsers=${c}`); } catch {}
  if (!u || !comparePassword(password.trim(), u.passwordHash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  const token = signToken(u.id);
  res.json({ token, user: { id: u.id, username: u.username, level: u.level } });
});

// ========== API（需登录） ==========

// 提供字库
app.get("/api/bank", (req, res) => {
  const level = req.query.level === "advanced" ? "advanced" : "basic";
  res.json({ chars: charBank[level] });
});

// 获取当前用户数据
app.get("/api/model", requireAuth, (req, res) => {
  const u = ensureUser(req.userId);
  res.json(u);
});

// 检查句子所有单词是否都已掌握（mastery >= 1.0）
function allMastered(words, familiarity) {
  return words.every(w => {
    const f = familiarity[w.toLowerCase()];
    return f && (f.mastery ?? 0) >= 1;
  });
}

// 智能出题（批量生成+缓存，随机出句，已掌握句自动剔除）
app.post("/api/deal", requireAuth, async (req, res) => {
  const userId = req.userId;
  const userData = ensureUser(userId);
  const { score } = req.body || {};
  if (typeof score === "number" && score !== userData.totalScore) {
    userData.totalScore = score;
  }

  const fam = userData.wordFamiliarity || {};

  // 1. 从缓存中剔除已完全掌握的句子，随机选一句
  let cache = sentenceCache.get(userId);
  if (cache && cache.length > 0) {
    // 过滤：去掉所有单词都已 mastery >= 1 的句子
    const remaining = cache.filter(r => !allMastered(r.targetWords, fam));
    if (remaining.length > 0) {
      sentenceCache.set(userId, remaining);
      const pick = remaining[Math.floor(Math.random() * remaining.length)];
      const pool = shuffle([...pick.targetWords]);
      const gl = { ...pick.glossary };
      for (const [w, g] of Object.entries(gl)) {
        const f = fam[w.toLowerCase()];
        if (f) g.mastery = f.mastery ?? 0;
      }
      return res.json({ ...pick, pool, glossary: gl });
    }
    // 全部掌握，清缓存生成新批次
    sentenceCache.delete(userId);
    cache = null;
  }

  // 2. 缓存空，批量生成
  const summary = {
    currentLevel: userData.level,
    totalSentences: userData.totalSentences,
    totalScore: userData.totalScore,
    recentPerformance: (userData.recentResults || []).slice(-10),
    wordStats: Object.fromEntries(
      Object.entries(userData.wordFamiliarity || {})
        .sort((a, b) => b[1].seen - a[1].seen)
        .map(([w, f]) => [
          w,
          {
            seen: f.seen,
            correct: f.correct,
            wrong: f.wrong,
            removed: f.removed || 0,
            avgTimeMs: f.seen > 0 ? Math.round(f.totalTime / f.seen) : 0,
            mastery: f.mastery ?? 0,
          },
        ])
    ),
  };

  try {
    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "你是一个英语教学AI，根据用户的词汇熟练度数据，一次性规划5个句子作为迷你课程单元。" +
              "\n\n熟练度规则（由系统自动计算，你只需根据熟练度出题）：" +
              "\n- 熟练度0-1，=1.0=完全掌握，<1.0=需巩固。wordStats中没出现的词=全新词" +
              "\n- 已掌握词(1.0)：作为句子'骨架'构造语境，可跨句复用" +
              "\n- 薄弱词(<1.0)：需要重点巩固，可在多句中复现以加深记忆" +
              "\n- 新词：分散引入到不同句子，5句之间新词尽量不重复" +
              "\n\n课程规划要求：" +
              "\n- type='巩固'：句子以薄弱词(<1.0)为主，用已掌握词搭骨架，可含0-1个新词" +
              "\n- type='引入新词'：句子在已掌握词基础上，引入1-3个新词" +
              "\n- 根据用户数据合理分配：薄弱词多则巩固句多，薄弱词少则多引入新词" +
              "\n- 词库为空时：5句全为'引入新词'，每句4-6词，从最常用词开始" +
              "\n- 5句难度逐步递增，句型多样不重复" +
              "\n- 单词只用英语最常用两万词" +
              "\n- 中文翻译(sentenceCn)必须严格对应英文句子，英文是短语就翻译成短语，不要自行补全意思" +
              "\n- 句子长度4-10词，根据水平调整\n\n" +
              "返回JSON（只返回JSON）：\n" +
              '{\n' +
              '  "level": 新等级1-5,\n' +
              '  "plan": [\n' +
              '    {\n' +
              '      "type": "巩固 或 引入新词",\n' +
              '      "sentence": "英文句子，单词间空格分隔，无标点",\n' +
              '      "sentenceCn": "整句中文翻译",\n' +
              '      "glossary": {"word": {"cn":"中文翻译","ipa":"IPA音标","note":"简短语法注释"}}\n' +
              '    },\n' +
              '    ...共5个\n' +
              '  ]\n' +
              '}\n' +
              '注意：glossary必须包含sentence中每个单词，一个不能少',
          },
          {
            role: "user",
            content:
              "用户学习数据如下，请分析并生成5句课程计划：\n" +
              JSON.stringify(summary, null, 2),
          },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return res.status(502).json({ error: `DeepSeek error ${resp.status}: ${t}` });
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    let plan;
    try { plan = JSON.parse(content); } catch {
      return res.status(502).json({ error: "Parse failed" });
    }

    const sentences = plan.plan;
    if (!Array.isArray(sentences) || sentences.length === 0) {
      return res.status(502).json({ error: "No sentences in plan" });
    }

    if (Number.isFinite(plan.level) && plan.level >= 1 && plan.level <= 5) {
      userData.level = plan.level;
    }

    // 3. 预处理所有句子，存入缓存
    const batch = [];
    for (const item of sentences) {
      const sentence = (item.sentence || "").replace(/[^a-zA-Z0-9 ]/g, "").trim();
      const words = sentence.split(/\s+/).filter(w => w && w.length > 1);
      if (words.length < 3) continue; // 跳过太短的句子

      const glossary = item.glossary || {};
      words.forEach(w => {
        const k = w.toLowerCase();
        if (!glossary[k]) glossary[k] = { cn: `[${w}]`, ipa: "", note: "" };
        if (!userData.wordFamiliarity[k]) {
          userData.wordFamiliarity[k] = { seen: 0, correct: 0, wrong: 0, removed: 0, totalTime: 0, mastery: 0 };
        }
        const f = userData.wordFamiliarity[k];
        f.cn = glossary[k].cn || f.cn;
        f.ipa = glossary[k].ipa || f.ipa;
        f.note = glossary[k].note || f.note;
        glossary[k].mastery = f.mastery ?? 0;
      });

      saveUser(userId, userData);
      for (const w of words) {
        saveWord(userId, w.toLowerCase(), userData.wordFamiliarity[w.toLowerCase()]);
      }

      const newWords = words.filter(w => {
        const f = userData.wordFamiliarity[w.toLowerCase()];
        return f && f.seen === 0;
      });
      const weakWords = words.filter(w => {
        const f = userData.wordFamiliarity[w.toLowerCase()];
        return f && f.seen > 0 && (f.mastery ?? 0) < 1;
      });
      let reason = "";
      if (weakWords.length) reason += "巩固" + weakWords.join(",");
      if (newWords.length) reason += (reason ? "·" : "") + "引入新词" + newWords.join(",");
      if (!reason) reason = "练习已掌握词";

      const pool = shuffle([...words]);

      batch.push({
        pool,
        targetWords: words,
        sentenceCn: item.sentenceCn || "",
        glossary,
        level: userData.level,
        reason,
        aiReason: item.reason || "",
        sentenceType: item.type || "",
      });
    }

    if (batch.length === 0) {
      return res.status(502).json({ error: "All sentences too short" });
    }

    sentenceCache.set(userId, batch);
    const round = batch[Math.floor(Math.random() * batch.length)];
    res.json(round);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 接收答题数据
app.post("/api/stats", requireAuth, (req, res) => {
  const userId = req.userId;

  const { words, totalTimeMs } = req.body;
  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: "Invalid data" });
  }

  const userData = ensureUser(userId);

  const correctCount = words.filter(w => w.correct).length;
  const avgTime = totalTimeMs
    ? totalTimeMs / words.length
    : words.reduce((s, w) => s + (w.timeMs || 0), 0) / words.length;

  for (const w of words) {
    const k = w.word.toLowerCase();
    if (!userData.wordFamiliarity[k]) {
      userData.wordFamiliarity[k] = {
        seen: 0, correct: 0, wrong: 0, removed: 0, totalTime: 0, mastery: 0,
      };
    }
    const f = userData.wordFamiliarity[k];
    if (f.mastery == null) f.mastery = 0;
    f.seen++;
    if (w.correct) { f.correct++; f.mastery = round2(Math.min(1, f.mastery + 0.3)); }
    else if (w.action === "remove") { f.removed = (f.removed || 0) + 1; }
    else { f.wrong++; f.mastery = round2(Math.max(0, f.mastery - 0.3)); }
    if (w.timeMs > 0) f.totalTime += w.timeMs;
    saveWord(userId, k, f);
  }

  const totalScore = Object.values(userData.wordFamiliarity).reduce((s, f) => s + (f.mastery || 0), 0);
  userData.totalScore = totalScore;
  userData.totalSentences++;
  userData.recentResults.push({ correct: correctCount, total: words.length, avgTimeMs: avgTime });
  if (userData.recentResults.length > 20) userData.recentResults.shift();

  saveUser(userId, userData);
  addResult(userId, correctCount, words.length, avgTime);

  res.json({ level: userData.level, totalSentences: userData.totalSentences });
});

const PORT = process.env.PORT || 3000;
try {
  const startCount = getUserCount();
  console.log(`DB ready, users: ${startCount}`);
} catch (e) {
  console.error(`DB init failed: ${e.message}`);
  console.error(e.stack);
}
app.listen(PORT, "0.0.0.0", () => {
  console.log(`文字麻将已启动: http://localhost:${PORT}`);
});
