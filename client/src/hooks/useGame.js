import { useState, useCallback, useRef } from "react";

const HAND = 12, HMAX = 16, OK = 10, BAD = 5;

export function useGame() {
  const [bank, setBank] = useState([]);
  const [hand, setHand] = useState([]);
  const [sentence, setSentence] = useState([]);
  const [targetWords, setTargetWords] = useState([]);
  const [glossary, setGlossary] = useState({});
  const [score, setScore] = useState(0);
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
            const a = f.seen ? (f.correct || 0) / f.seen : 0;
            const t = f.seen ? (f.totalTime || 0) / f.seen : 9e4;
            return { word: w, seen: f.seen, ok: f.correct || 0, cls: a >= .9 && t < 2000 ? "m" : a >= .7 ? "f" : "w" };
          }).sort((a, b) => ({ w: 0, f: 1, m: 2 })[a.cls] - ({ w: 0, f: 1, m: 2 })[b.cls]));
      }
      if (typeof d.totalScore === "number") {
        setScore(d.totalScore);
        savedScore = d.totalScore;
      }
    } catch {}
    return savedScore;
  }, []);

  const submit = useCallback(async (currentScore) => {
    if (!logRef.current.length) return;
    const t = logRef.current.reduce((s, a) => s + (a.t || 0), 0);
    try {
      await fetch("/api/stats", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: logRef.current.map(a => ({ word: a.w, correct: a.ok, timeMs: a.t || 0, action: a.act || "play", timestamp: a.ts })), totalTimeMs: t, score: currentScore }) });
    } catch {}
    fetchModel();
  }, [fetchModel]);

  const newRound = useCallback(async (currentScore) => {
    setLoading(true);
    try {
      const r = await fetch("/api/deal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score: currentScore }) });
      const d = await r.json();
      if (d.error) { setTip("Failed"); setLoading(false); return; }
      const p = [...d.pool], h = [];
      while (h.length < HAND && p.length) h.push(p.pop());
      setBank(p); setHand(h); setTargetWords(d.targetWords);
      setGlossary(d.glossary || {}); if (d.level) setLevel(d.level);
      setSentence([]); setProgress(0);
      logRef.current = []; t0Ref.current = Date.now();
      setFeedback(""); setFType(""); setTip("Tap a word");
    } catch { setTip("Network error"); }
    setLoading(false);
  }, []);

  const start = useCallback(async () => {
    setHand([]); setSentence([]); setTargetWords([]);
    setGlossary({}); logRef.current = [];
    setFeedback(""); setFType(""); setTip("");
    const savedScore = await fetchModel(); // 从后端加载分数和等级
    await newRound(savedScore);
  }, [fetchModel, newRound]);

  /** 点手牌 */
  function tap(word, idx) {
    const tw = targetWords;
    const pg = progress;
    if (pg >= tw.length) return;

    const now = performance.now();
    const prev = logRef.current[logRef.current.length - 1];
    const ms = prev ? Math.round(now - prev.ts) : t0Ref.current ? Math.round(now - t0Ref.current) : 1000;

    if (word.toLowerCase() === tw[pg].toLowerCase()) {
      // ✅ 正确
      speak(word);
      logRef.current.push({ w: word, ok: true, t: ms, act: "play", ts: now });

      setHand(prev => { const c = [...prev]; c.splice(idx, 1); return c; });
      setSentence(prev => [...prev, word]);
      const ns = score + OK;
      setScore(ns);
      const np = pg + 1;
      setProgress(np);

      if (np >= tw.length) {
        setFeedback("✓ Done!");
        setFType("ok");
        setLoading(true);
        const finalScore = ns;
        submit(finalScore).then(() => newRound(finalScore));
      } else {
        setFeedback("✓");
        setFType("ok");
      }
    } else {
      // ❌ 错误：只说错，不泄露答案
      logRef.current.push({ w: word, ok: false, t: ms, act: "play", ts: now });
      setScore(s => s - BAD);
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

  return {
    bank, hand, sentence, targetWords, glossary,
    score, progress, level, loading,
    feedback, fType, tip,
    vocab, showVocab, setShowVocab,
    start, tap, removeSentence, clearAll, draw, speak,
  };
}
