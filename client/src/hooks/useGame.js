import { useState, useCallback, useRef } from "react";

const HAND = 12, HMAX = 16;

export function useGame() {
  const [bank, setBank] = useState([]);
  const [hand, setHand] = useState([]);
  const [sentence, setSentence] = useState([]);
  const [targetWords, setTargetWords] = useState([]);
  const [sentenceCn, setSentenceCn] = useState("");
  const [reason, setReason] = useState("");
  const [glossary, setGlossary] = useState({});
  const [localMastery, setLocalMastery] = useState({});
  const [progress, setProgress] = useState(0);
  const [level, setLevel] = useState(1);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [fType, setFType] = useState("");
  const [tip, setTip] = useState("");
  const [vocab, setVocab] = useState([]);
  const [showVocab, setShowVocab] = useState(false);

  const logRef = useRef([]);
  const t0Ref = useRef(0);
  const speakerRef = useRef(null);

  const speak = useCallback((w) => {
    // 异步：丢到事件队列末尾，不阻塞 UI
    setTimeout(() => {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(w);
        u.lang = "en-US"; u.rate = 0.85;
        speechSynthesis.speak(u);
      } catch {}
    }, 0);
  }, []);

  const fetchModel = useCallback(async () => {
    let savedScore = 0;
    try {
      const r = await fetch("/api/model");
      const d = await r.json();
      if (d.level) setLevel(d.level);
      if (d.wordFamiliarity) {
        setVocab(Object.entries(d.wordFamiliarity)
          .map(([w, f]) => {
            const m = f.mastery ?? 0;
            const cls = m >= 1 ? "m" : m >= 0.5 ? "f" : "w";
            return { word: w, seen: f.seen, ok: f.correct || 0, mastery: m, cls, cn: f.cn, ipa: f.ipa, note: f.note };
          }).sort((a, b) => a.mastery - b.mastery));
      }
      if (typeof d.totalScore === "number") {
        setScore(d.totalScore);
        savedScore = d.totalScore;
      }
    } catch {}
    return savedScore;
  }, []);

  const submit = useCallback(async () => {
    if (!logRef.current.length) return;
    const t = logRef.current.reduce((s, a) => s + (a.t || 0), 0);
    const sc = Object.values(localMastery).reduce((s, m) => s + m, 0);
    try {
      await fetch("/api/stats", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: logRef.current.map(a => ({ word: a.w, correct: a.ok, timeMs: a.t || 0, action: a.act || "play", timestamp: a.ts })), totalTimeMs: t, score: sc }) });
    } catch {}
    fetchModel();
  }, [fetchModel, localMastery]);

  const newRound = useCallback(async () => {
    setLoading(true);
    try {
      const sc = Object.values(localMastery).reduce((s, m) => s + m, 0);
      const r = await fetch("/api/deal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score: sc }) });
      const d = await r.json();
      if (d.error) { setTip("Failed"); setLoading(false); return; }
      const p = [...d.pool], h = [];
      while (h.length < HAND && p.length) h.push(p.pop());
      setBank(p); setHand(h); setTargetWords(d.targetWords);
      setSentenceCn(d.sentenceCn || "");
      setReason(d.reason || "");
      const gl = d.glossary || {};
      setGlossary(gl);
      // 初始化本地熟练度表
      const lm = {};
      Object.entries(gl).forEach(([k, v]) => { lm[k.toLowerCase()] = v.mastery ?? 0; });
      setLocalMastery(lm);
      if (d.level) setLevel(d.level);
      setSentence([]); setProgress(0);
      logRef.current = [];
      setFeedback(""); setFType(""); setTip("Tap a word");
    } catch { setTip("Network error"); }
    setLoading(false);
  }, []);

  const start = useCallback(async () => {
    setHand([]); setSentence([]); setTargetWords([]);
    setSentenceCn(""); setReason(""); setGlossary({}); setLocalMastery({}); logRef.current = [];
    setFeedback(""); setFType(""); setTip("");
    await fetchModel();
    await newRound();
  }, [fetchModel, newRound]);

  /** 点手牌 */
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
      // ✅ 正确：本地立即+0.3
      speak(word);
      setFeedback(""); setFType("");
      const k = word.toLowerCase();
      setLocalMastery(prev => ({ ...prev, [k]: Math.min(1, (prev[k] ?? 0) + 0.3) }));
      logRef.current.push({ w: word, ok: true, t: ms, act: "play", ts: now });

      setHand(prev => { const c = [...prev]; c.splice(idx, 1); return c; });
      setSentence(prev => [...prev, word]);
      const np = pg + 1;
      setProgress(np);

      if (np >= tw.length) {
        setFeedback("✓ Done!");
        setFType("ok");
        setLoading(true);
        submit().then(() => newRound());
      }
    } else {
      // ❌ 错误：选错的词和正确答案都-0.3，本地立即生效
      speak(word);
      const kw = word.toLowerCase();
      const kt = tw[pg].toLowerCase();
      setLocalMastery(prev => {
        const next = { ...prev };
        next[kw] = Math.max(0, (next[kw] ?? 0) - 0.3);
        next[kt] = Math.max(0, (next[kt] ?? 0) - 0.3);
        return next;
      });
      logRef.current.push({ w: word, ok: false, t: ms, act: "play", ts: now });
      logRef.current.push({ w: tw[pg], ok: false, t: ms, act: "missed", ts: now });
      setFeedback("✗ Wrong");
      setFType("bad");
    }
  }

  /** 句子区移除回手牌 */
  function removeSentence(word) {
    setSentence(prev => {
      const i = prev.indexOf(word);
      if (i < 0) return prev;
      setHand(h => [...h, word]);
      setProgress(i);
      setFeedback(""); setFType("");
      logRef.current.push({ w: word, ok: false, t: 0, act: "remove", ts: performance.now() });
      return prev.filter((_, j) => j !== i);
    });
  }

  function getGlossary(word) {
    const g = glossary[word.toLowerCase()] || {};
    const m = localMastery[word.toLowerCase()];
    return m != null ? { ...g, mastery: m } : g;
  }

  function clearAll() {
    setHand(h => [...h, ...sentence]);
    setSentence([]); setProgress(0);
    setFeedback(""); setFType("");
  }

  function draw() {
    setBank(prev => {
      if (!prev.length) { setTip("Deck empty"); return prev; }
      if (hand.length >= HMAX) { setTip("Hand full"); return prev; }
      const c = [...prev];
      setHand(h => [...h, c.pop()]);
      return c;
    });
  }

  const score = vocab.reduce((s, v) => {
    const lm = localMastery[v.word.toLowerCase()];
    return s + (lm != null ? lm : (v.mastery || 0));
  }, 0);

  return {
    bank, hand, sentence, targetWords, sentenceCn, reason, glossary,
    score, progress, level, loading,
    feedback, fType, tip,
    vocab, showVocab, setShowVocab,
    start, newRound, tap, removeSentence, clearAll, draw, speak, getGlossary,
  };
}
