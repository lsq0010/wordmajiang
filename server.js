import express from "express";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { charBank } from "./chars.js";

dotenv.config({ override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

// ========== 用户自适应模型（内存存储） ==========
let userModel = {
  level: 1,
  recentResults: [],    // [{correct, total, avgTimeMs}]
  wordFamiliarity: {},  // {word: {seen, correct, totalTime, lastSeen}}
  totalSentences: 0,
};

function getWordCount(level){
  return 3 + level * 2; // level1=5, level2=7, ..., level5=13
}

// 评估并更新难度
function evaluateLevel(){
  const recent = userModel.recentResults.slice(-5);
  if (recent.length < 3) return;
  const avgAcc = recent.reduce((s,r) => s + r.correct/r.total, 0) / recent.length;
  const avgTime = recent.reduce((s,r) => s + r.avgTimeMs, 0) / recent.length;
  if (avgAcc > 0.9 && avgTime < 2000 && userModel.level < 5) {
    userModel.level++;
  } else if ((avgAcc < 0.55 || avgTime > 5000) && userModel.level > 1) {
    userModel.level--;
  }
}

// 计算词的熟悉度分数（0-1，越高越熟）
function familiarityScore(f){
  if (!f || f.seen === 0) return 0;
  // 正确率权重
  const acc = f.seen > 0 ? f.correct / f.seen : 0;
  // 移除/错误惩罚
  const penalty = f.seen > 0 ? (f.wrong * 1.5 + f.removed * 0.5) / f.seen : 0;
  // 速度加分：平均反应<2秒为快
  const avgTime = f.seen > 0 ? f.totalTime / f.seen : 10000;
  const speedBonus = avgTime < 2000 ? 0.2 : avgTime < 4000 ? 0.1 : 0;
  // 见过越多越稳定
  const volumeBonus = Math.min(f.seen / 10, 0.2);
  return Math.max(0, Math.min(1, acc - penalty + speedBonus + volumeBonus));
}

// 获取薄弱词（最不熟悉的前N个）
function getWeakWords(n = 3){
  return Object.entries(userModel.wordFamiliarity)
    .filter(([,d]) => d.seen >= 2)
    .sort((a, b) => familiarityScore(a[1]) - familiarityScore(b[1]))
    .slice(0, n)
    .map(e => e[0]);
}

// ========== API ==========

// 提供字库（参考用）
app.get("/api/bank", (req, res) => {
  const level = req.query.level === "advanced" ? "advanced" : "basic";
  res.json({ chars: charBank[level] });
});

// 获取当前用户模型（前端显示进度用）
app.get("/api/model", (req, res) => {
  const weak = getWeakWords(5);
  const allWords = Object.entries(userModel.wordFamiliarity).map(([w, f]) => ({
    word: w, seen: f.seen, correct: f.correct, wrong: f.wrong,
    removed: f.removed, avgTime: f.seen > 0 ? Math.round(f.totalTime / f.seen) : 0,
    familiarity: familiarityScore(f)
  }));
  res.json({
    level: userModel.level,
    totalSentences: userModel.totalSentences,
    weakWords: weak,
    allWords: allWords.sort((a,b) => a.familiarity - b.familiarity).slice(0, 10)
  });
});

// 智能发牌：根据用户水平自适应句子长度和词汇
app.get("/api/deal", async (req, res) => {
  const bank = charBank[userModel.level > 3 ? "advanced" : "basic"];
  const wordCount = getWordCount(userModel.level);
  const weakWords = getWeakWords(3);
  let weakHint = "";
  if (weakWords.length > 0) {
    weakHint = ` Please include at least two of these words: ${weakWords.join(", ")}.`;
  }

  try {
    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              `Generate ONE natural English sentence, exactly ${wordCount} words. ` +
              "For each word, provide: Chinese translation (cn), " +
              "a brief grammar/usage note in Chinese (note), and IPA pronunciation (ipa)." +
              weakHint +
              " Return ONLY a JSON object, no markdown:\n" +
              '{"sentence":"the apple is red","glossary":{"the":{"cn":"那个","ipa":"ðə","note":"定冠词"},"apple":{"cn":"苹果","ipa":"ˈæpəl","note":"名词"},"is":{"cn":"是","ipa":"ɪz","note":"be动词"},"red":{"cn":"红色的","ipa":"rɛd","note":"形容词"}}}'
          },
          { role: "user", content: "Generate" }
        ],
        temperature: 0.95,
        response_format: { type: "json_object" }
      })
    });
    if (!resp.ok) {
      const t = await resp.text();
      return res.status(502).json({ error: `DeepSeek error ${resp.status}: ${t}` });
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    let plan;
    try { plan = JSON.parse(content); } catch { return res.status(502).json({ error: "Parse failed" }); }

    const sentence = (plan.sentence || "").replace(/[^a-zA-Z0-9 ]/g, "").trim();
    const words = sentence.split(/\s+/).filter(w => w && w.length > 1);
    if (words.length < 4) {
      return res.status(502).json({ error: "Sentence too short" });
    }

    const glossary = plan.glossary || {};
    words.forEach(w => {
      const k = w.toLowerCase();
      if (!glossary[k]) glossary[k] = { cn: `[${w}]`, ipa: "", note: "" };
    });

    const pool = shuffle([...words]);

    res.json({
      pool, targetWords: words, glossary,
      level: userModel.level
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 接收答题统计数据，更新用户模型
app.post("/api/stats", (req, res) => {
  const { words, totalTimeMs } = req.body; // words: [{word, correct, timeMs}]
  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: "Invalid data" });
  }

  const correctCount = words.filter(w => w.correct).length;
  const avgTime = totalTimeMs ? totalTimeMs / words.length : words.reduce((s,w)=>s+w.timeMs,0)/words.length;

  // 更新每个词的数据（精确行为追踪）
  words.forEach(w => {
    const k = w.word.toLowerCase();
    if (!userModel.wordFamiliarity[k]) {
      userModel.wordFamiliarity[k] = {
        seen: 0, correct: 0, wrong: 0, removed: 0,
        totalTime: 0, lastSeen: Date.now(), history: []
      };
    }
    const f = userModel.wordFamiliarity[k];
    f.seen++;
    if (w.correct) f.correct++;
    else if (w.action === "remove") f.removed++;
    else f.wrong++;

    if (w.timeMs > 0) f.totalTime += w.timeMs;
    f.lastSeen = Date.now();
    // 保留最近50条行为记录用于精细分析
    f.history.push({
      correct: w.correct,
      action: w.action || "play",
      timeMs: w.timeMs || 0,
      timestamp: w.timestamp || Date.now()
    });
    if (f.history.length > 50) f.history.shift();
  });

  userModel.totalSentences++;
  userModel.recentResults.push({ correct: correctCount, total: words.length, avgTimeMs: avgTime });
  if (userModel.recentResults.length > 20) userModel.recentResults.shift();

  evaluateLevel();

  res.json({ level: userModel.level, totalSentences: userModel.totalSentences });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`文字麻将已启动: http://localhost:${PORT}`);
});
