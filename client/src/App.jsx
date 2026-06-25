import { useEffect } from "react";
import { useGame } from "./hooks/useGame";
import WordTile from "./components/WordTile";

export default function App() {
  const g = useGame();

  useEffect(() => {
    g.start();
  }, []);

  if (g.isLoading) {
    return <div className="loading">Generating board...</div>;
  }

  const masteryColor = (cls) => {
    if (cls === "mastered") return "var(--m-green)";
    if (cls === "familiar") return "var(--m-blue)";
    return "var(--m-red)";
  };

  return (
    <div className="app">
      {/* Top Bar */}
      <div className="topbar">
        <div className="topbar-left">
          <span className="title">Vocab Builder</span>
          <span className="lv">Lv.{g.level}</span>
        </div>
        <div className="topbar-right">
          <div className="stat"><b>{g.score}</b><span>Score</span></div>
          <div className="stat"><b>{g.hand.length}</b><span>Hand</span></div>
          <div className="stat"><b>{g.bank.length}</b><span>Deck</span></div>
        </div>
      </div>

      {/* Main area */}
      <div className="main-area">
        {/* Target */}
        {g.targetWords.length > 0 && (
          <div className="target">
            <span className="label">Target</span>
            <div className="target-text">
              {g.targetWords.map((w, i) => (
                <span key={i} className={i < g.sentence.length ? "done" : ""}>
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Sentence */}
        <div className="section">
          <span className="label">Your Sentence</span>
          <div className="tiles">
            {g.sentence.length === 0 ? (
              <span className="muted">Tap a word below to place it</span>
            ) : (
              g.sentence.map((w, i) => (
                <WordTile
                  key={`s-${i}-${w}`}
                  word={w}
                  glossary={g.glossary[w.toLowerCase()]}
                  isSentence
                  onTap={() => g.removeFromSentence(w)}
                  onSpeak={g.speakWord}
                />
              ))
            )}
          </div>
        </div>

        {/* Feedback */}
        {g.feedbackMessage && (
          <div className={`feedback ${g.feedbackType}`}>{g.feedbackMessage}</div>
        )}

        {/* Hand */}
        <div className="section">
          <span className="label">Your Hand</span>
          <div className="tiles">
            {g.hand.map((w, i) => (
              <WordTile
                key={`h-${i}-${w}`}
                word={w}
                glossary={g.glossary[w.toLowerCase()]}
                onTap={() => g.playTile(w, i)}
                onSpeak={g.speakWord}
              />
            ))}
          </div>
        </div>

        {/* Vocab Panel */}
        {g.showVocab && (
          <div className="section">
            <span className="label">Learned Words ({g.vocabWords.length})</span>
            <div className="tiles">
              {g.vocabWords.map((vw) => (
                <div
                  key={vw.word}
                  className="v-item"
                  style={{ background: masteryColor(vw.masteryClass) + "22" }}
                >
                  <span className="vw">{vw.word}</span>
                  <span className="vf">{vw.correct}/{vw.seen}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tip */}
        {g.tipText && !g.feedbackMessage && <span className="tip">{g.tipText}</span>}
      </div>

      {/* Bottom Bar */}
      <div className="bottombar">
        <button className="btn" onClick={g.clearSentence}>Clear</button>
        <button className="btn" onClick={g.draw} disabled={g.bank.length === 0 || g.hand.length >= 16}>Draw</button>
        <button className="btn" onClick={g.start}>New Game</button>
        <button className="btn" onClick={() => g.setShowVocab(!g.showVocab)}>
          {g.showVocab ? "Hide" : "Words"}
        </button>
      </div>
    </div>
  );
}
