import { useState, useCallback, useRef } from "react";
import { t } from "../i18n";

const HAND = 12, HMAX = 16;
const round2 = (n) => Math.round(n * 100) / 100;

export function useGame(token) {
  const [bank, setBank] = useState([]);
  const [hand, setHand] = useState([]);
  const [sentence, setSentence] = useState([]);
  const [targetWords, setTargetWords] = useState([]);
  const [sentenceCn, setSentenceCn] = useState("");
  const [reason, setReason] = useState("");
  const [glossary, setGlossary] = useState({});
  const [localMastery, setLocalMastery] = useState({});
  const [progress, setProgress] = useState(0);
  const [level, setLevel] = useState(() => {
    try { return Number(localStorage.getItem("wm_level")) || 1; } catch { return 1; }
  });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [fType, setFType] = useState("");
  const [tip, setTip] = useState("");
  const [vocab, setVocab] = useState(() => {
    try { const d = JSON.parse(localStorage.getItem("wm_vocab") || "[]"); return Array.isArray(d) ? d : []; }
    catch { return []; }
  });
  const [sentenceType, setSentenceType] = useState("");
  const [showVocab, setShowVocab] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [nativeLang, setNativeLang] = useState(() => {
    try { return localStorage.getItem("wm_nativeLang") || "zh-CN"; } catch { return "zh-CN"; }
  });
  const [targetLang, setTargetLang] = useState(() => {
    try { return localStorage.getItem("wm_targetLang") || "en-US"; } catch { return "en-US"; }
  });

  const logRef = useRef([]);
  const t0Ref = useRef(0);
  const targetLangRef = useRef(targetLang);
  targetLangRef.current = targetLang;
  const nativeLangRef = useRef(nativeLang);
  nativeLangRef.current = nativeLang;

  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  }), [token]);

  const checkAuth = useCallback((res) => {
    if (res.status === 401) setAuthError(true);
  }, []);

  const speak = useCallback((w) => {
    const lang = targetLangRef.current || "en-US";
    setTimeout(() => {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(w);
        u.lang = lang; u.rate = 0.85;
        speechSynthesis.speak(u);
      } catch {}
    }, 0);
  }, [targetLang]);

  const fetchModel = useCallback(async (tgtLang, natLang) => {
    const tgt = tgtLang || targetLangRef.current;
    const nat = natLang || nativeLangRef.current;
    let savedScore = 0;
    try {
      const r = await fetch(`/api/model?targetLang=${encodeURIComponent(tgt)}&nativeLang=${encodeURIComponent(nat)}`, { headers: authHeaders() });
      checkAuth(r);
      const d = await r.json();
      if (d.level) { setLevel(d.level); try { localStorage.setItem("wm_level", d.level); } catch {} }
      if (d.nativeLang) { setNativeLang(d.nativeLang); try { localStorage.setItem("wm_nativeLang", d.nativeLang); } catch {} }
      if (d.targetLang) { setTargetLang(d.targetLang); try { localStorage.setItem("wm_targetLang", d.targetLang); } catch {} }
      if (d.wordFamiliarity) {
        const v = Object.entries(d.wordFamiliarity)
          .map(([w, f]) => {
            const m = f.mastery ?? 0;
            const cls = m >= 1 ? "m" : m >= 0.5 ? "f" : "w";
            return { word: w, seen: f.seen, ok: f.correct || 0, mastery: m, cls, cn: f.cn, ipa: f.ipa, note: f.note };
          }).sort((a, b) => a.mastery - b.mastery);
        setVocab(v);
        try { localStorage.setItem("wm_vocab", JSON.stringify(v)); } catch {}
      }
      if (typeof d.totalScore === "number") {
        savedScore = d.totalScore;
      }
    } catch {}
    return savedScore;
  }, [authHeaders, checkAuth]);

  const submit = useCallback(async () => {
    if (!logRef.current.length) return;
    const t = logRef.current.reduce((s, a) => s + (a.t || 0), 0);
    const sc = Object.values(localMastery).reduce((s, m) => s + m, 0);
    try {
      const r = await fetch("/api/stats", { method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ words: logRef.current.map(a => ({ word: a.w, correct: a.ok, timeMs: a.t || 0, action: a.act || "play", timestamp: a.ts })), totalTimeMs: t, score: sc, targetLang: targetLangRef.current, nativeLang: nativeLangRef.current }) });
      checkAuth(r);
    } catch {}
    fetchModel();
  }, [fetchModel, localMastery, authHeaders, checkAuth]);

  const newRound = useCallback(async (tgtLang, natLang) => {
    const tgt = tgtLang || targetLangRef.current;
    const nat = natLang || nativeLangRef.current;
    setLoading(true);
    try {
      const sc = Object.values(localMastery).reduce((s, m) => s + m, 0);
      const r = await fetch("/api/deal", { method: "POST", headers: authHeaders(), body: JSON.stringify({ score: sc, targetLang: tgt, nativeLang: nat }) });
      checkAuth(r);
      const d = await r.json();
      if (d.error) { setTip(t(nativeLangRef.current, "failed")); setLoading(false); return; }
      const p = [...d.pool], h = [];
      while (h.length < HAND && p.length) h.push(p.pop());
      setBank(p); setHand(h); setTargetWords(d.targetWords);
      setSentenceCn(d.sentenceCn || "");
      setReason(d.reason || "");
      setSentenceType(d.sentenceType || "");
      const gl = d.glossary || {};
      setGlossary(gl);
      const lm = {};
      Object.entries(gl).forEach(([k, v]) => { lm[k.toLowerCase()] = v.mastery ?? 0; });
      setLocalMastery(lm);
      if (d.level) { setLevel(d.level); try { localStorage.setItem("wm_level", d.level); } catch {} }
      setSentence([]); setProgress(0);
      logRef.current = [];
      setFeedback(""); setFType(""); setTip(t(nativeLangRef.current, "tapWord"));
    } catch { setTip(t(nativeLangRef.current, "networkError")); }
    setLoading(false);
  }, [authHeaders, checkAuth]);

  const setLanguages = useCallback(async (nat, tgt) => {
    setNativeLang(nat);
    setTargetLang(tgt);
    try { localStorage.setItem("wm_nativeLang", nat); } catch {}
    try { localStorage.setItem("wm_targetLang", tgt); } catch {}
    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ nativeLang: nat, targetLang: tgt }),
      });
    } catch {}
  }, [authHeaders]);

  const start = useCallback(async (tgtLang, natLang) => {
    setHand([]); setSentence([]); setTargetWords([]);
    setSentenceCn(""); setReason(""); setGlossary({}); setLocalMastery({}); logRef.current = [];
    setFeedback(""); setFType(""); setTip("");
    await fetchModel(tgtLang, natLang);
    await newRound(tgtLang, natLang);
  }, [fetchModel, newRound]);

  function tap(word, idx) {
    const tw = targetWords;
    const pg = progress;
    if (pg >= tw.length) return;

    const now = performance.now();
    const prev = logRef.current[logRef.current.length - 1];
    const firstTap = !prev;
    if (firstTap) t0Ref.current = now;
    const ms = prev ? Math.round(now - prev.ts) : 0;

    if (word.toLowerCase() === tw[pg].toLowerCase()) {
      speak(word);
      setFeedback(""); setFType("");
      const k = word.toLowerCase();
      setLocalMastery(prev => ({ ...prev, [k]: round2(Math.min(1, (prev[k] ?? 0) + 0.3)) }));
      logRef.current.push({ w: word, ok: true, t: ms, act: "play", ts: now });

      setHand(prev => { const c = [...prev]; c.splice(idx, 1); return c; });
      setSentence(prev => [...prev, word]);
      const np = pg + 1;
      setProgress(np);

      if (np >= tw.length) {
        setFeedback(t(nativeLangRef.current, "done"));
        setFType("ok");
        setTimeout(() => {
          setLoading(true);
          submit().then(() => newRound());
        }, 1000);
      }
    } else {
      speak(word);
      const kw = word.toLowerCase();
      const kt = tw[pg].toLowerCase();
      setLocalMastery(prev => {
        const next = { ...prev };
        next[kw] = round2(Math.max(0, (next[kw] ?? 0) - 0.3));
        next[kt] = round2(Math.max(0, (next[kt] ?? 0) - 0.3));
        return next;
      });
      logRef.current.push({ w: word, ok: false, t: ms, act: "play", ts: now });
      logRef.current.push({ w: tw[pg], ok: false, t: ms, act: "missed", ts: now });
      setFeedback(t(nativeLangRef.current, "wrong"));
      setFType("bad");
    }
  }

  function getGlossary(word) {
    const g = glossary[word.toLowerCase()] || {};
    const m = localMastery[word.toLowerCase()];
    return m != null ? { ...g, mastery: m } : g;
  }

  const score = vocab.reduce((s, v) => {
    const lm = localMastery[v.word.toLowerCase()];
    return s + (lm != null ? lm : (v.mastery || 0));
  }, 0);

  const sentenceMastered = targetWords.filter(w => {
    const m = localMastery[w.toLowerCase()];
    return m != null && m >= 1;
  }).length;

  return {
    bank, hand, sentence, targetWords, sentenceCn, reason, glossary,
    score, progress, level, loading,
    feedback, fType, tip,
    vocab, showVocab, setShowVocab,
    start, newRound, tap, speak, getGlossary,
    sentenceType, sentenceMastered, authError,
    nativeLang, targetLang, setLanguages,
  };
}
