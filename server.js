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

const langNames = {
  "zh-CN": "中文", "zh-TW": "繁體中文", "ja-JP": "日本語", "ko-KR": "한국어", "mn-MN": "Монгол",
  "vi-VN": "Tiếng Việt", "th-TH": "ไทย", "id-ID": "Bahasa Indonesia", "ms-MY": "Bahasa Melayu",
  "tl-PH": "Tagalog", "km-KH": "ភាសាខ្មែរ", "lo-LA": "ລາວ", "my-MM": "မြန်မာ",
  "hi-IN": "हिन्दी", "bn-IN": "বাংলা", "ta-IN": "தமிழ்", "te-IN": "తెలుగు",
  "mr-IN": "मराठी", "gu-IN": "ગુજરાતી", "kn-IN": "ಕನ್ನಡ", "ml-IN": "മലയാളം",
  "pa-IN": "ਪੰਜਾਬੀ", "ur-PK": "اردو", "si-LK": "සිංහල", "ne-NP": "नेपाली",
  "ar-SA": "العربية", "he-IL": "עברית", "fa-IR": "فارسی", "tr-TR": "Türkçe",
  "kk-KZ": "Қазақша", "uz-UZ": "Oʻzbek", "az-AZ": "Azərbaycanca",
  "ka-GE": "ქართული", "hy-AM": "Հայերեն",
  "sv-SE": "Svenska", "da-DK": "Dansk", "fi-FI": "Suomi", "no-NO": "Norsk",
  "is-IS": "Íslenska", "lt-LT": "Lietuvių", "lv-LV": "Latviešu", "et-EE": "Eesti",
  "en-GB": "English", "fr-FR": "Français", "de-DE": "Deutsch", "nl-NL": "Nederlands",
  "nl-BE": "Vlaams", "ga-IE": "Gaeilge", "cy-GB": "Cymraeg",
  "es-ES": "Español", "it-IT": "Italiano", "pt-PT": "Português", "el-GR": "Ελληνικά",
  "sq-AL": "Shqip", "mt-MT": "Malti",
  "ru-RU": "Русский", "pl-PL": "Polski", "uk-UA": "Українська", "cs-CZ": "Čeština",
  "sk-SK": "Slovenčina", "hu-HU": "Magyar", "ro-RO": "Română", "bg-BG": "Български",
  "sr-RS": "Српски", "hr-HR": "Hrvatski", "sl-SI": "Slovenščina", "bs-BA": "Bosanski",
  "mk-MK": "Македонски",
  "sw-KE": "Kiswahili", "am-ET": "አማርኛ", "af-ZA": "Afrikaans", "zu-ZA": "isiZulu",
  "xh-ZA": "isiXhosa", "ha-NG": "Hausa", "yo-NG": "Yorùbá", "ig-NG": "Igbo",
  "so-SO": "Soomaali", "rw-RW": "Ikinyarwanda", "tn-BW": "Setswana", "sn-ZW": "chiShona",
  "ny-MW": "Chichewa", "mg-MG": "Malagasy",
  "en-US": "English", "es-MX": "Español", "pt-BR": "Português", "fr-CA": "Français",
  "qu-PE": "Runasimi",
  "en-AU": "English", "mi-NZ": "Te Reo Māori", "sm-WS": "Gagana Samoa", "to-TO": "Lea Faka-Tonga",
};
function langName(code) { return langNames[code] || code; }

// 句子缓存：userId:pair → 预生成的回合数组
const sentenceCache = new Map();
function cacheKey(userId, pair) { return `${userId}:${pair}`; }
function pairKey(tgt, nat) { return `${tgt}:${nat}`; }

// ========== 认证路由 ==========

app.post("/api/auth/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || typeof username !== "string" || username.trim().length < 3 || username.trim().length > 20) {
    return res.status(400).json({ error: "ERR_USERNAME_SHORT" });
  }
  const pwd = password.trim();
  if (!pwd || typeof pwd !== "string" || pwd.length < 6) {
    return res.status(400).json({ error: "ERR_PASSWORD_SHORT" });
  }
  const u = findUserByUsername(username.trim());
  if (u) return res.status(409).json({ error: "ERR_USERNAME_TAKEN" });
  const nativeLang = req.body.nativeLang || "zh-CN";
  const targetLang = req.body.targetLang || "en-US";
  const hash = hashPassword(pwd);
  const user = createUser(username.trim(), hash, nativeLang, targetLang);
  const token = signToken(user.id);
  res.json({ token, user: { id: user.id, username: user.username, level: user.level, nativeLang: user.nativeLang, targetLang: user.targetLang } });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "ERR_CREDENTIALS_REQUIRED" });
  }
  const u = findUserByUsername(username.trim());
  try { const c = getUserCount(); console.log(`LOGIN: user="${username.trim()}" found=${!!u} totalUsers=${c}`); } catch {}
  if (!u || !comparePassword(password.trim(), u.passwordHash)) {
    return res.status(401).json({ error: "ERR_INVALID_CREDENTIALS" });
  }
  const token = signToken(u.id);
  res.json({ token, user: { id: u.id, username: u.username, level: u.level, nativeLang: u.nativeLang || "zh-CN", targetLang: u.targetLang || "en-US" } });
});

// ========== API（需登录） ==========

// 提供字库
app.get("/api/bank", (req, res) => {
  const level = req.query.level === "advanced" ? "advanced" : "basic";
  res.json({ chars: charBank[level] });
});

// 获取当前用户数据
app.get("/api/model", requireAuth, (req, res) => {
  const tgt = req.query.targetLang || "en-US";
  const nat = req.query.nativeLang || "zh-CN";
  const pair = pairKey(tgt, nat);
  const u = ensureUser(req.userId, pair);
  res.json({ ...u, nativeLang: u.nativeLang || "zh-CN", targetLang: u.targetLang || "en-US" });
});

// 语言偏好
app.get("/api/preferences", requireAuth, (req, res) => {
  const u = ensureUser(req.userId);
  res.json({ nativeLang: u.nativeLang || "zh-CN", targetLang: u.targetLang || "en-US" });
});

app.post("/api/preferences", requireAuth, (req, res) => {
  const { nativeLang, targetLang } = req.body || {};
  if (!nativeLang || !targetLang) return res.status(400).json({ error: "nativeLang and targetLang required" });
  const u = ensureUser(req.userId);
  u.nativeLang = nativeLang;
  u.targetLang = targetLang;
  saveUser(req.userId, u);
  // 清除该用户所有语言缓存
  for (const key of sentenceCache.keys()) {
    if (key.startsWith(req.userId + ":")) sentenceCache.delete(key);
  }
  res.json({ nativeLang, targetLang });
});

// 按掌握词数计算等级
function computeLevel(familiarity) {
  const mastered = Object.values(familiarity || {}).filter(f => (f.mastery ?? 0) >= 1).length;
  if (mastered < 50) return 1;
  if (mastered < 200) return 2;
  if (mastered < 800) return 3;
  if (mastered < 2000) return 4;
  return 5;
}

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
  const { score, targetLang, nativeLang } = req.body || {};
  const tgt = targetLang || "en-US";
  const nat = nativeLang || "zh-CN";
  const pair = pairKey(tgt, nat);
  const userData = ensureUser(userId, pair);
  if (typeof score === "number" && score !== userData.totalScore) {
    userData.totalScore = score;
  }

  const fam = userData.wordFamiliarity || {};
  const ck = cacheKey(userId, pair);

  // 1. 从缓存中剔除已完全掌握的句子，随机选一句
  let cache = sentenceCache.get(ck);
  if (cache && cache.length > 0) {
    // 过滤：去掉所有单词都已 mastery >= 1 的句子
    const remaining = cache.filter(r => !allMastered(r.targetWords, fam));
    if (remaining.length > 0) {
      sentenceCache.set(ck, remaining);
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
    sentenceCache.delete(ck);
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
              `你是一个${langName(tgt)}教学AI，用户母语为${langName(nat)}。根据用户的词汇熟练度数据，一次性规划5个句子作为迷你课程单元。` +
              `\n\n所有句子必须用${langName(tgt)}编写，所有翻译必须用${langName(nat)}。` +
              "\n\n熟练度规则（由系统自动计算，你只需根据熟练度出题）：" +
              "\n- 熟练度0-1，=1.0=完全掌握，<1.0=需巩固。wordStats中没出现的词=全新词" +
              "\n- 已掌握词(1.0)：作为句子'骨架'构造语境，可跨句复用" +
              "\n- 薄弱词(<1.0)：需要重点巩固，可在多句中复现以加深记忆" +
              "\n- 新词：分散引入到不同句子，5句之间新词尽量不重复" +
              "\n\n课程规划要求：" +
              "\n- type='consolidate'：句子以薄弱词(<1.0)为主，用已掌握词搭骨架，可含0-1个新词" +
              "\n- type='introduce'：句子在已掌握词基础上，引入1-3个新词" +
              "\n- 根据用户数据合理分配：薄弱词多则巩固句多，薄弱词少则多引入新词" +
              "\n- 词库为空时：5句全为'introduce'，每句4-6词，从最常用词开始" +
              "\n- 5句难度逐步递增，句型多样不重复" +
              "\n- 只用最常用的词汇，避免生僻词" +
              `\n- 翻译(sentenceCn)必须严格对应原文句子，原文是短语就翻译成短语，不要自行补全意思` +
              "\n- 句子长度4-10词，根据水平调整\n\n" +
              "返回JSON（只返回JSON）：\n" +
              '{\n' +
              '  "plan": [\n' +
              '    {\n' +
              '      "type": "consolidate 或 introduce 或 practice",\n' +
              `      "sentence": "${langName(tgt)}句子，单词间空格分隔，无标点",\n` +
              `      "sentenceCn": "整句${langName(nat)}翻译",\n` +
              `      "reasonText": "用${langName(nat)}写的本轮说明，如'巩固xxx·引入新词yyy'",\n` +
              `      "glossary": {"word": {"cn":"${langName(nat)}翻译","ipa":"音标/发音","note":"简短语法注释"}}\n` +
              '    },\n' +
              '    ...共5个\n' +
              '  ]\n' +
              '}\n' +
              '注意：glossary必须包含sentence中每个单词，一个不能少。reasonText用母语自然表达本轮学习重点。',
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

    // 根据最新数据计算等级
    userData.level = computeLevel(userData.wordFamiliarity);

    // 3. 预处理所有句子，存入缓存
    const batch = [];
    for (const item of sentences) {
      const sentence = (item.sentence || "").replace(/[^\p{L}\p{N} ]/gu, "").trim();
      const words = sentence.split(/\s+/).filter(w => w && w.length > 0);
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
        saveWord(userId, w.toLowerCase(), pair, userData.wordFamiliarity[w.toLowerCase()]);
      }

      const pool = shuffle([...words]);

      batch.push({
        pool,
        targetWords: words,
        sentenceCn: item.sentenceCn || "",
        glossary,
        level: userData.level,
        reason: item.reasonText || "",
        aiReason: item.reasonText || "",
        sentenceType: item.type || "",
      });
    }

    if (batch.length === 0) {
      return res.status(502).json({ error: "All sentences too short" });
    }

    sentenceCache.set(ck, batch);
    const round = batch[Math.floor(Math.random() * batch.length)];
    res.json(round);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 接收答题数据
app.post("/api/stats", requireAuth, (req, res) => {
  const userId = req.userId;

  const { words, totalTimeMs, targetLang, nativeLang } = req.body;
  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: "Invalid data" });
  }

  const pair = pairKey(targetLang || "en-US", nativeLang || "zh-CN");
  const userData = ensureUser(userId, pair);

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
    saveWord(userId, k, pair, f);
  }

  const totalScore = Object.values(userData.wordFamiliarity).reduce((s, f) => s + (f.mastery || 0), 0);
  userData.totalScore = totalScore;
  userData.totalSentences++;
  userData.recentResults.push({ correct: correctCount, total: words.length, avgTimeMs: avgTime });
  if (userData.recentResults.length > 20) userData.recentResults.shift();

  userData.level = computeLevel(userData.wordFamiliarity);
  saveUser(userId, userData);
  addResult(userId, correctCount, words.length, avgTime);

  res.json({ level: userData.level, totalSentences: userData.totalSentences });
});

// 手写识别
app.post("/api/recognize-handwriting", requireAuth, async (req, res) => {
  const { image, targetLang } = req.body || {};
  if (!image) return res.status(400).json({ error: "image required" });
  const u = ensureUser(req.userId);
  const tgt = targetLang || u.targetLang || "en-US";

  try {
    const base64 = image.replace(/^data:image\/\w+;base64,/, "");
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
            role: "user",
            content: [
              { type: "text", text: `识别图片中的手写${langName(tgt)}单词，只返回单词本身，不要任何其他内容。看不清楚返回 ?` },
              { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
            ],
          },
        ],
        max_tokens: 20,
        temperature: 0,
      }),
    });

    if (!resp.ok) {
      return res.status(502).json({ error: `Recognition failed` });
    }
    const data = await resp.json();
    const recognized = (data.choices?.[0]?.message?.content || "").trim().toLowerCase();
    res.json({ recognized });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 动态翻译 UI 字符串（冷门语言让 DeepSeek 实时翻译并缓存）
const uiTranslateCache = new Map();

app.post("/api/translate-ui", requireAuth, async (req, res) => {
  const { lang, langName: langNameStr } = req.body || {};
  if (!lang) return res.status(400).json({ error: "ERR_LANG_REQUIRED" });

  const name = langNameStr || lang;
  if (uiTranslateCache.has(lang)) {
    return res.json({ strings: uiTranslateCache.get(lang) });
  }

  const sourceStrings = {
    appTitle: "词记",
    appSub: "词汇记忆工具",
    level: "Lv.",
    score: "分数",
    words: "词汇",
    loading: "像滚雪球一样增加词汇...",
    tutorial: "用已掌握的词带新词，像滚雪球一样逐步扩展词汇量。点击单词拼成句子，单词熟练度从0到1逐步提升。",
    close: "关闭",
    wordBank: "词库",
    mastery: "熟练度",
    refresh: "刷新",
    handwriting: "手写",
    practiceHandwriting: "练习手写",
    login: "登录",
    register: "注册",
    username: "用户名",
    password: "密码",
    loadingBtn: "加载中...",
    haveAccount: "已有账号？",
    noAccount: "没有账号？",
    logout: "退出登录",
    confirmLogout: "确认退出登录？",
    cancel: "取消",
    nativeLang: "母语",
    targetLang: "学习语言",
    selectLang: "选择语言",
    confirm: "确认",
    tapWord: "点击一个单词",
    failed: "失败",
    networkError: "网络错误",
    done: "✓ 完成！",
    wrong: "✗ 错误",
    errUsernameShort: "用户名需要3-20个字符",
    errPasswordShort: "密码至少需要6个字符",
    errUsernameTaken: "用户名已被占用",
    errCredentialsRequired: "请输入用户名和密码",
    errInvalidCredentials: "用户名或密码错误",
    errNetwork: "网络错误",
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
            content: `你是一个专业翻译。将以下JSON中每个value从中文翻译成${name}。JSON的key是英文字段名（如appTitle、close），绝对不能翻译或修改key，只能翻译value对应的中文文本。保持简洁自然，适合移动App界面。返回完整JSON，key一字不改。`,
          },
          {
            role: "user",
            content: JSON.stringify(sourceStrings, null, 2),
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      return res.status(502).json({ error: "ERR_TRANSLATE_FAILED" });
    }

    const data = await resp.json();
    const translated = JSON.parse(data.choices?.[0]?.message?.content || "{}");

    // 合并：源字符串兜底，确保所有 key 都存在
    const merged = { ...sourceStrings, ...translated };
    uiTranslateCache.set(lang, merged);
    res.json({ strings: merged });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
