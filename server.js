import express from "express";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { charBank } from "./chars.js";
import { initDb, ensureUser, saveUser, saveWord, addResult, createUser, findUserByUsername, getUserCount } from "./db.js";
import { hashPassword, comparePassword, signToken, requireAuth } from "./auth.js";

dotenv.config({ override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "client", "dist")));

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
const round2 = (n) => Math.round(n * 100) / 100;

// ========== 认证路由 ==========

app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || typeof username !== "string" || username.trim().length < 3 || username.trim().length > 20) {
    return res.status(400).json({ error: "Username must be 3-20 characters" });
  }
  const pwd = password.trim();
  if (!pwd || typeof pwd !== "string" || pwd.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  const u = await findUserByUsername(username.trim());
  if (u) return res.status(409).json({ error: "Username already taken" });
  const hash = hashPassword(pwd);
  const user = await createUser(username.trim(), hash);
  const token = signToken(user.id);
  res.json({ token, user: { id: user.id, username: user.username, level: user.level } });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  const u = await findUserByUsername(username.trim());
  const count = await getUserCount();
  console.log(`LOGIN: user="${username.trim()}" found=${!!u} totalUsers=${count}`);
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
app.get("/api/model", requireAuth, async (req, res) => {
  const u = await ensureUser(req.userId);
  res.json(u);
});

// 智能出题
app.post("/api/deal", requireAuth, async (req, res) => {
  const userId = req.userId;
  const userData = await ensureUser(userId);
  const { score } = req.body || {};
  if (typeof score === "number" && score !== userData.totalScore) {
    userData.totalScore = score;
  }

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
              "你是一个英语教学AI，根据用户的词汇熟练度数据出题。" +
              "\n\n核心机制（熟练度由系统自动计算，你只需根据熟练度出题）：" +
              "\n- 熟练度0-1，=1.0=完全掌握，<1.0=需巩固。wordStats中没出现的词=全新词" +
              "\n- 词库为空时：出一句4-6个常用词的简单句，全部是新词，表意完整" +
              "\n- 有词熟练度<1.0时：用已掌握词搭骨架，重点练<1.0的词" +
              "\n- 所有词都=1.0后：才可引入1个新词" +
              "\n- 每次出新句子，尽量用已掌握词的不同组合，避免重复" +
              "\n- 单词只用英语最常用两万词" +
              "\n- 中文翻译(sentenceCn)必须严格对应英文句子，英文是短语就翻译成短语，不要自行补全意思" +
              "\n- 句子长度4-10词，根据水平调整" +
              "\n- 不要连续用相同句型\n\n" +
              "返回JSON（只返回JSON）：\n" +
              '{\n' +
              '  "sentence": "英文句子，单词间空格分隔，无标点",\n' +
              '  "sentenceCn": "整句中文翻译",\n' +
              '  "level": 新等级1-5,\n' +
              '  "reason": "任意",\n' +
              '  "glossary": {\n' +
              '    "word": {"cn": "中文翻译", "ipa": "IPA音标", "note": "简短语法注释"}\n' +
              '  },\n' +
              '  注意：glossary必须包含sentence中每个单词，一个不能少\n' +
              '}',
          },
          {
            role: "user",
            content:
              "用户学习数据如下，请分析并生成下一题：\n" +
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

    const sentence = (plan.sentence || "").replace(/[^a-zA-Z0-9 ]/g, "").trim();
    const words = sentence.split(/\s+/).filter(w => w && w.length > 1);
    if (words.length < 3) {
      return res.status(502).json({ error: "Sentence too short" });
    }

    if (Number.isFinite(plan.level) && plan.level >= 1 && plan.level <= 5) {
      userData.level = plan.level;
    }

    const glossary = plan.glossary || {};
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

    await saveUser(userId, userData);
    for (const w of words) {
      const k = w.toLowerCase();
      await saveWord(userId, k, userData.wordFamiliarity[k]);
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

    res.json({
      pool,
      targetWords: words,
      sentenceCn: plan.sentenceCn || "",
      glossary,
      level: userData.level,
      reason,
      aiReason: plan.reason || "",
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 接收答题数据
app.post("/api/stats", requireAuth, async (req, res) => {
  const userId = req.userId;

  const { words, totalTimeMs } = req.body;
  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: "Invalid data" });
  }

  const userData = await ensureUser(userId);

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
    await saveWord(userId, k, f);
  }

  const totalScore = Object.values(userData.wordFamiliarity).reduce((s, f) => s + (f.mastery || 0), 0);
  userData.totalScore = totalScore;
  userData.totalSentences++;
  userData.recentResults.push({ correct: correctCount, total: words.length, avgTimeMs: avgTime });
  if (userData.recentResults.length > 20) userData.recentResults.shift();

  await saveUser(userId, userData);
  await addResult(userId, correctCount, words.length, avgTime);

  res.json({ level: userData.level, totalSentences: userData.totalSentences });
});

const PORT = process.env.PORT || 3000;
await initDb();
const startCount = await getUserCount();
app.listen(PORT, "0.0.0.0", () => {
  console.log(`文字麻将已启动: http://localhost:${PORT} (users: ${startCount})`);
});
