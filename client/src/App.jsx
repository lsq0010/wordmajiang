import { useEffect, useState } from "react";
import { useGame } from "./hooks/useGame";
import WordTile from "./components/WordTile";
import AuthForm from "./components/AuthForm";

function getToken() {
  try { return localStorage.getItem("wm_token"); } catch { return null; }
}
function saveAuth(token, user) {
  try {
    localStorage.setItem("wm_token", token);
    localStorage.setItem("wm_user", JSON.stringify(user));
  } catch {}
}
function clearAuth() {
  try { localStorage.removeItem("wm_token"); localStorage.removeItem("wm_user"); } catch {}
}

export default function App() {
  const [token, setToken] = useState(getToken);
  const g = useGame(token);
  const [showCn, setShowCn] = useState(true);
  const [expandedWord, setExpandedWord] = useState(null);
  const [firstRound, setFirstRound] = useState(true);

  useEffect(() => {
    if (token) g.start();
  }, [token]);

  useEffect(() => { setShowCn(true); }, [g.sentenceCn]);
  useEffect(() => {
    if (g.feedback === "✓ Done!") setFirstRound(false);
  }, [g.feedback]);

  useEffect(() => {
    if (g.authError) { clearAuth(); setToken(null); }
  }, [g.authError]);

  const handleAuth = (t, user) => {
    saveAuth(t, user);
    setToken(t);
  };

  if (!token) return <AuthForm onAuth={handleAuth} />;
  if (g.loading) return <div className="loading">Generating board...</div>;

  const mc = (c) => c === "m" ? "var(--m-green)" : c === "f" ? "var(--m-blue)" : "var(--m-red)";

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-left">
          <span className="title">Vocab Builder</span>
          <span className="lv">Lv.{g.level}</span>
        </div>
        <div className="topbar-right">
          <div className="stat"><b>{g.score}</b><span>Score</span></div>
          <div className="stat"><b>{g.hand.length}</b><span>Hand</span></div>
          <div className="stat" onClick={() => g.setShowVocab(!g.showVocab)} style={{cursor:"pointer"}}>
            <b>{g.vocab.length}</b><span>Words</span>
          </div>
        </div>
      </div>

      <div className="main-area">
        {g.sentenceCn && (
          <div className="target">
            <div className="target-cn" onClick={() => setShowCn(!showCn)}>
              {showCn ? g.sentenceCn : "***"}
            </div>
            <div className="target-sentence">
              {g.sentence.length === 0 ? (
                <span className="target-muted">Tap a word below to place it</span>
              ) : (
                g.sentence.join(" ")
              )}
            </div>
          </div>
        )}

        {g.feedback && <div className={`feedback ${g.fType}`}>{g.feedback}</div>}

        <div className="section">
          <span className="label">Your Hand</span>
          {g.reason && <div className="reason">• {g.reason}</div>}
          <div className="tiles">
            {g.hand.map((w, i) => (
              <WordTile key={`h-${i}-${w}`} word={w} glossary={g.getGlossary(w)}
                onTap={() => g.tap(w, i)} />
            ))}
          </div>
        </div>

        {firstRound && (
          <div className="tutorial">
            用已掌握的词带新词，像滚雪球一样逐步扩展词汇量。点击单词拼成句子，单词熟练度从0到1，逐步提升，点击顶部中文可隐藏提示。
          </div>
        )}

        {g.tip && !g.feedback && <span className="tip">{g.tip}</span>}
      </div>

      {g.showVocab && (
        <div className="vocab-overlay">
          <div className="vocab-header">
            <span className="vocab-title">Word Bank ({g.vocab.length})</span>
            <button className="btn" onClick={() => g.setShowVocab(false)}>Close</button>
          </div>
          <div className="vocab-body">
              {g.vocab.map(v => {
                const expanded = expandedWord === v.word;
                return (
                  <div key={v.word} className={`v-item ${expanded ? "v-expanded" : ""}`}
                    style={{ background: mc(v.cls) + "22", borderColor: mc(v.cls) + "44" }}
                    onClick={() => {
                      g.speak(v.word);
                      setExpandedWord(expanded ? null : v.word);
                    }}>
                    <span className="vw" style={{ color: mc(v.cls) }}>{v.word}</span>
                    {expanded && v.cn && <span className="vd-cn">{v.cn}</span>}
                    {expanded && v.ipa && <span className="vd-ipa">{v.ipa}</span>}
                    {expanded && v.note && <span className="vd-note">{v.note}</span>}
                    {expanded && <span className="vd-mastery">熟练度 {(v.mastery || 0).toFixed(2)}</span>}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="bottombar">
        <button className="btn" onClick={() => g.newRound()}>Refresh</button>
      </div>
    </div>
  );
}
