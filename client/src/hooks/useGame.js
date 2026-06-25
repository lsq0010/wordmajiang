import { useState, useCallback, useRef } from "react";

const HAND_SIZE = 12;
const HAND_MAX = 16;
const OK_SCORE = 10;
const BAD_PENALTY = 5;

export function useGame() {
  const [bank, setBank] = useState([]);
  const [hand, setHand] = useState([]);
  const [sentence, setSentence] = useState([]);
  const [targetWords, setTargetWords] = useState([]);
  const [glossary, setGlossary] = useState({});
  const [score, setScore] = useState(0);
  const [progress, setProgress] = useState(0);
  const [level, setLevel] = useState(1);
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackType, setFeedbackType] = useState("");
  const [tipText, setTipText] = useState("");
  const [vocabWords, setVocabWords] = useState([]);
  const [showVocab, setShowVocab] = useState(false);

  const roundStartRef = useRef(0);
  const actionLogRef = useRef([]);
  const speakerRef = useRef(null);
  const busyRef = useRef(false);

  const speakWord = useCallback((word) => {
    // 异步执行避免阻塞 UI 渲染
    setTimeout(() => {
      if (!speakerRef.current) {
        speakerRef.current = new SpeechSynthesisUtterance();
        speakerRef.current.lang = "en-US";
        speakerRef.current.rate = 0.85;
      }
      speechSynthesis.cancel();
      speakerRef.current.text = word;
      speechSynthesis.speak(speakerRef.current);
    }, 50);
  }, []);

  const fetchModel = useCallback(async () => {
    try {
      const r = await fetch("/api/model");
      const d = await r.json();
      if (d.level) setLevel(d.level);
      if (d.wordFamiliarity) {
        const words = Object.entries(d.wordFamiliarity)
          .map(([w, f]) => {
            const acc = f.seen > 0 ? (f.correct || 0) / f.seen : 0;
            const avgT = f.seen > 0 ? (f.totalTime || 0) / f.seen : 99999;
            let cls = "weak";
            if (acc >= 0.9 && avgT < 2000) cls = "mastered";
            else if (acc >= 0.7) cls = "familiar";
            return { word: w, seen: f.seen, correct: f.correct || 0, masteryClass: cls };
          })
          .sort((a, b) => {
            const o = { weak: 0, familiar: 1, mastered: 2 };
            return (o[a.masteryClass] ?? 2) - (o[b.masteryClass] ?? 2);
          });
        setVocabWords(words);
      }
    } catch {}
  }, []);

  const submitStats = useCallback(
    async (actionLog, currentScore) => {
      if (actionLog.length === 0) return;
      const total = actionLog.reduce((s, a) => s + (a.timeMs || 0), 0);
      try {
        const r = await fetch("/api/stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            words: actionLog.map((a) => ({
              word: a.word,
              correct: a.correct,
              timeMs: a.timeMs || 0,
              action: a.action || "play",
              timestamp: a.timestamp,
            })),
            totalTimeMs: total,
            score: currentScore,
          }),
        });
        const d = await r.json();
        if (d.level) setLevel(d.level);
      } catch {}
      fetchModel();
    },
    [fetchModel]
  );

  const newRound = useCallback(
    async (currentScore) => {
      try {
        const r = await fetch("/api/deal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score: currentScore }),
        });
        const d = await r.json();
        if (d.error) {
          setTipText("Failed: " + d.error);
          setIsLoading(false);
          return;
        }
        setBank(d.pool);
        setTargetWords(d.targetWords);
        setGlossary(d.glossary || {});
        if (d.level) setLevel(d.level);

        const pool = [...d.pool];
        const newHand = [];
        while (newHand.length < HAND_SIZE && pool.length > 0 && newHand.length < HAND_MAX) {
          newHand.push(pool.pop());
        }
        setBank(pool);
        setHand(newHand);
        setSentence([]);
        setProgress(0);
        actionLogRef.current = [];
        roundStartRef.current = Date.now();
        setFeedbackMessage("");
        setFeedbackType("");
        setTipText("Tap the next word to build the sentence");
      } catch (e) {
        setTipText("Failed: " + e.message);
      }
      setIsLoading(false);
    },
    []
  );

  const start = useCallback(async () => {
    setScore(0);
    setProgress(0);
    setLevel(1);
    setHand([]);
    setSentence([]);
    setBank([]);
    setTargetWords([]);
    setGlossary({});
    actionLogRef.current = [];
    setFeedbackMessage("");
    setFeedbackType("");
    setTipText("");
    setIsLoading(true);
    busyRef.current = false;
    setBusy(false);
    await fetchModel();
    await newRound(0);
  }, [fetchModel, newRound]);

  const playTile = useCallback(
    (word, idx) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);

      const now = performance.now();
      const lastLog = actionLogRef.current[actionLogRef.current.length - 1];
      const startTime = roundStartRef.current;
      const elapsed = lastLog
        ? Math.round(now - lastLog.timestamp)
        : startTime > 0
        ? Math.round(now - startTime)
        : 1000;

      const expected = targetWords[progress];
      if (!expected) {
        busyRef.current = false;
        setBusy(false);
        return;
      }

      if (word.toLowerCase() === expected.toLowerCase()) {
        speakWord(word);
        const newAction = { word, correct: true, timeMs: elapsed, action: "play", timestamp: now };
        actionLogRef.current = [...actionLogRef.current, newAction];

        setHand((prev) => {
          const copy = [...prev];
          copy.splice(idx, 1);
          return copy;
        });
        setSentence((prev) => [...prev, word]);
        setScore((s) => s + OK_SCORE);
        const newProgress = progress + 1;
        setProgress(newProgress);

        if (newProgress >= targetWords.length) {
          const finalLog = actionLogRef.current;
          const finalScore = score + OK_SCORE;
          setFeedbackType("ok");
          setFeedbackMessage(`Complete! +${OK_SCORE}`);
          busyRef.current = false;
          setBusy(false);

          setTimeout(() => {
            submitStats(finalLog, finalScore);
            setSentence([]);
            setProgress(0);
            roundStartRef.current = performance.now();
            actionLogRef.current = [];
            busyRef.current = true;
            setBusy(true);
            newRound(finalScore).then(() => {
              busyRef.current = false;
              setBusy(false);
            });
          }, 1500);
          return;
        }
        setFeedbackType("ok");
        setFeedbackMessage(`+${OK_SCORE}`);
      } else {
        const newAction = { word, correct: false, timeMs: elapsed, action: "play", timestamp: now };
        actionLogRef.current = [...actionLogRef.current, newAction];
        setScore((s) => s - BAD_PENALTY);
        setFeedbackType("bad");
        setFeedbackMessage(`Expected "${expected}" -${BAD_PENALTY}`);
      }
      busyRef.current = false;
      setBusy(false);
    },
    [progress, targetWords, score, speakWord, submitStats, newRound, OK_SCORE, BAD_PENALTY]
  );

  const removeFromSentence = useCallback((word) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSentence((prev) => {
      const idx = prev.indexOf(word);
      if (idx < 0) {
        busyRef.current = false;
        return prev;
      }
      setHand((h) => [...h, word]);
      setProgress(idx);
      actionLogRef.current = [
        ...actionLogRef.current,
        { word, correct: false, timeMs: 0, action: "remove", timestamp: performance.now() },
      ];
      setFeedbackMessage("");
      setFeedbackType("");
      busyRef.current = false;
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const clearSentence = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    setHand((prev) => [...prev, ...sentence]);
    setSentence([]);
    setProgress(0);
    setFeedbackMessage("");
    setFeedbackType("");
    busyRef.current = false;
  }, [sentence]);

  const draw = useCallback(() => {
    if (bank.length === 0 || hand.length >= HAND_MAX) {
      setTipText(hand.length >= HAND_MAX ? "Hand full" : "Deck empty");
      return;
    }
    setBank((prev) => {
      const copy = [...prev];
      const word = copy.pop();
      setHand((h) => [...h, word]);
      return copy;
    });
  }, [bank.length, hand.length]);

  return {
    // state
    bank,
    hand,
    sentence,
    targetWords,
    glossary,
    score,
    progress,
    level,
    busy,
    isLoading,
    feedbackMessage,
    feedbackType,
    tipText,
    vocabWords,
    showVocab,
    // actions
    start,
    playTile,
    removeFromSentence,
    clearSentence,
    draw,
    speakWord,
    setShowVocab,
  };
}
