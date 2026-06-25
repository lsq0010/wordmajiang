import express from "express";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import { charBank } from "./chars.js";

dotenv.config({ override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

// ========== 用户数据持久化 ==========
const DATA_FILE = join(__dirname, ".userdata.json");

function loadUserData(){
  try {
    if(fs.existsSync(DATA_FILE)){
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch(e){ console.error("Failed to load user data:", e.message); }
  return null;
}

function saveUserData(){
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(userModel, null, 2), "utf-8");
  } catch(e){ console.error("Failed to save user data:", e.message); }
}

let userModel = loadUserData() || {
  level: 1,
  totalSentences: 0,
  totalScore: 0,
  recentResults: [],
  wordFamiliarity: {},
};

console.log(`用户数据已加载: ${userModel.totalSentences}句, 分数${userModel.totalScore}, Lv.${userModel.level}`);

// ========== API ==========

// 提供字库（参考用）
app.get("/api/bank", (req, res) => {
  const level = req.query.level === "advanced" ? "advanced" : "basic";
  res.json({ chars: charBank[level] });
});

// 获取当前用户数据
app.get("/api/model", (req, res) => {
  res.json(userModel);
});

// 智能出题：把全部用户数据丢给 DeepSeek，让它决定一切
app.post("/api/deal", async (req, res) => {
  const { score } = req.body || {};
  if (typeof score === "number") userModel.totalScore = score;

  // 把数据压缩成精简摘要发给 DeepSeek
  const summary = {
    currentLevel: userModel.level,
    totalSentences: userModel.totalSentences,
    totalScore: userModel.totalScore,
    recentPerformance: userModel.recentResults.slice(-10),
    wordStats: Object.fromEntries(
      Object.entries(userModel.wordFamiliarity)
        .sort((a, b) => b[1].seen - a[1].seen)
        .map(([w, f]) => [
          w,
          {
            seen: f.seen,
            correct: f.correct,
            wrong: f.wrong,
            removed: f.removed || 0,
            avgTimeMs: f.seen > 0 ? Math.round(f.totalTime / f.seen) : 0,
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
              "你是一个英语教学AI。根据用户的全部学习数据，判断其水平、决定该出什么句子来最大化学习效果。" +
              "\n\n规则：\n" +
              "- wordStats 包含所有学过的词及统计数据，已掌握的也偶尔穿插复习（间隔重复）。" +
              "- 正确率低或反应慢（>3000ms）的词=薄弱，多重复直到掌握\n" +
              "- 根据整体表现决定句子长度（4-12词）和难度等级（1-5）\n" +
              "- 低等级用日常短词，高等级用书面长词\n" +
              "- 不要连续用相同句型\n\n" +
              "返回JSON（只返回JSON，不要markdown）：\n" +
              '{\n' +
              '  "sentence": "英文句子，单词间空格分隔，无标点",\n' +
              '  "level": 新的难度等级1-5,\n' +
              '  "reason": "出题依据（10字内）",\n' +
              '  "glossary": {\n' +
              '    "word": {"cn": "中文翻译", "ipa": "IPA音标", "note": "简短中文语法注释"}\n' +
              '  }\n' +
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

    // 同步 DeepSeek 判定的等级
    if (Number.isFinite(plan.level) && plan.level >= 1 && plan.level <= 5) {
      userModel.level = plan.level;
      saveUserData();
    }

    const glossary = plan.glossary || {};
    words.forEach(w => {
      const k = w.toLowerCase();
      if (!glossary[k]) glossary[k] = { cn: `[${w}]`, ipa: "", note: "" };
    });

    const pool = shuffle([...words]);

    res.json({
      pool,
      targetWords: words,
      glossary,
      level: userModel.level,
      reason: plan.reason || "",
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 接收答题数据，纯收集不做判断
app.post("/api/stats", (req, res) => {
  const { words, totalTimeMs, score } = req.body;
  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: "Invalid data" });
  }

  const correctCount = words.filter(w => w.correct).length;
  const avgTime = totalTimeMs
    ? totalTimeMs / words.length
    : words.reduce((s, w) => s + (w.timeMs || 0), 0) / words.length;

  // 更新每个词
  words.forEach(w => {
    const k = w.word.toLowerCase();
    if (!userModel.wordFamiliarity[k]) {
      userModel.wordFamiliarity[k] = {
        seen: 0, correct: 0, wrong: 0, removed: 0, totalTime: 0,
      };
    }
    const f = userModel.wordFamiliarity[k];
    f.seen++;
    if (w.correct) f.correct++;
    else if (w.action === "remove") f.removed = (f.removed || 0) + 1;
    else f.wrong++;
    if (w.timeMs > 0) f.totalTime += w.timeMs;
  });

  if (typeof score === "number") userModel.totalScore = score;
  userModel.totalSentences++;
  userModel.recentResults.push({ correct: correctCount, total: words.length, avgTimeMs: avgTime });
  if (userModel.recentResults.length > 20) userModel.recentResults.shift();

  saveUserData();
  res.json({ level: userModel.level, totalSentences: userModel.totalSentences });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`文字麻将已启动: http://localhost:3000`);
});
