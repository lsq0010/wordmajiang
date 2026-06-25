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

// 提供字库（参考用）
app.get("/api/bank", (req, res) => {
  const level = req.query.level === "advanced" ? "advanced" : "basic";
  res.json({ chars: charBank[level] });
});

// 智能发牌：一次联网生成完整方案——
// 目标句 + 每个词的插入顺序（第几步插、插到当前片段哪个位置）+ 干扰词
// 客户端按方案表本地判定，点词零延迟。
app.get("/api/deal", async (req, res) => {
  const level = req.query.level === "advanced" ? "advanced" : "basic";
  const bank = charBank[level];
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
              "You generate a natural, grammatically correct, meaningful English sentence, 4 to 8 words. " +
              "No punctuation, no numbers, no special characters. " +
              "Then provide the correct insertion order: starting from an empty fragment, at each step, " +
              "insert one word at the best position (0=front, len=end) so the intermediate result is always " +
              "a reasonable English fragment building toward the full sentence. " +
              "Only return JSON (no markdown, no extra text). Format:\n" +
              '{"sentence":"full target sentence","steps":[{"char":"aword","position":0},...]}\n' +
              "Make sure the sentence is commonly used, natural English."
          },
          { role: "user", content: "Generate" }
        ],
        temperature: 0.9,
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
    try { plan = JSON.parse(content); } catch { return res.status(502).json({ error: "Failed to parse plan" }); }

    const sentence = (plan.sentence || "").replace(/[^a-zA-Z0-9 ]/g, "").trim();
    const words = sentence.split(/\s+/).filter(w => w);
    const steps = Array.isArray(plan.steps) ? plan.steps : [];
    if (words.length < 3 || steps.length < 3) {
      return res.status(502).json({ error: "Generated sentence too short, retry" });
    }

    // 解题表：每个词的插入步骤
    const solution = steps.map((s, i) => ({
      step: i,
      char: String(s.char || "").replace(/[^a-zA-Z0-9']/g, "").toLowerCase(),
      position: Number.isFinite(s.position) ? s.position : i
    })).filter(s => s.char);

    if (solution.length < 3) {
      return res.status(502).json({ error: "Solution steps incomplete, retry" });
    }

    // 牌堆：目标词 + 干扰词（约 40%），洗牌
    const targetWords = solution.map(s => s.char);
    const noiseCount = Math.max(3, Math.ceil(targetWords.length * 0.4));
    const noise = [];
    for (let i = 0; i < noiseCount; i++) {
      noise.push(bank[Math.floor(Math.random() * bank.length)]);
    }
    const pool = shuffle([...targetWords, ...noise]);

    res.json({
      pool,                  // 整个牌堆（目标词 + 干扰词）
      target: words.join(" "), // 目标句
      solution               // 解题步骤表
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`文字麻将已启动: http://localhost:${PORT}`);
});
