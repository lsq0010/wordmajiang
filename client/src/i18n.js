// 只内置中文 — 其余语言由 DeepSeek 实时翻译并缓存到本地
const zh = {
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

// 运行时缓存：内存 + localStorage
const _cache = {};
try {
  const saved = JSON.parse(localStorage.getItem("wm_i18n_cache") || "{}");
  Object.assign(_cache, saved);
} catch {}

function save() {
  try { localStorage.setItem("wm_i18n_cache", JSON.stringify(_cache)); } catch {}
}

export function t(lang, key) {
  if (lang === "zh-CN") return zh[key] || key;
  if (_cache[lang] && _cache[lang][key]) return _cache[lang][key];
  return zh[key] || key;
}

export function hasTranslations(lang) {
  return lang === "zh-CN" || !!_cache[lang];
}

export async function fetchTranslations(lang, langNameStr) {
  if (lang === "zh-CN" || _cache[lang]) return true;
  try {
    const token = localStorage.getItem("wm_token");
    if (!token) return false;
    const r = await fetch("/api/translate-ui", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lang, langName: langNameStr || lang }),
    });
    if (!r.ok) return false;
    const d = await r.json();
    if (d.strings) {
      _cache[lang] = d.strings;
      save();
      return true;
    }
  } catch {}
  return false;
}
