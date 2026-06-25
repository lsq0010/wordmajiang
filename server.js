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

// 发牌：DeepSeek 生成目标句 + 每个词的翻译和注释
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
              "Generate ONE natural English sentence, 4 to 8 words. For each word, provide Chinese translation (cn) " +
              "and a brief grammar/usage note in Chinese (note). Return ONLY a JSON object, no markdown:\n" +
              '{"sentence":"the apple is red","glossary":{"the":{"cn":"那个","note":"定冠词，指特定事物"},"apple":{"cn":"苹果","note":"名词"},"is":{"cn":"是","note":"be动词第三人称单数"},"red":{"cn":"红色的","note":"形容词"}}}'
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
    // Ensure every word has a glossary entry
    words.forEach(w => {
      const k = w.toLowerCase();
      if (!glossary[k]) glossary[k] = { cn: `[${w}]`, note: "" };
    });

    const pool = shuffle([...words]);

    res.json({ pool, targetWords: words, glossary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`文字麻将已启动: http://localhost:${PORT}`);
});
