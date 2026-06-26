import { useEffect } from "react";
import { useGame } from "./hooks/useGame";
import WordTile from "./components/WordTile";

export default function App() {
  const g = useGame();

  useEffect(() => { g.start(); }, []);

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
          <div className="stat"><b>{g.bank.length}</b><span>Deck</span></div>
        </div>
      </div>

      <div className="main-area">
        {g.targetWords.length > 0 && (
          <div className="target">
            <span className="label">Target</span>
            <div className="target-text">
              {g.targetWords.map((w, i) => (
                <span key={i} className={i < g.sentence.length ? "done" : ""}>{w}</span>
              ))}
            </div>
          </div>
        )}

        <div className="section">
          <span className="label">Your Sentence</span>
          <div className="tiles">
            {g.sentence.length === 0 ? (
              <span className="muted">Tap a word below to place it</span>
            ) : (
              g.sentence.map((w, i) => (
                <WordTile key={`s-${i}-${w}`} word={w} glossary={g.glossary[w.toLowerCase()]} isSentence
                  onTap={() => g.removeSentence(w)} onSpeak={g.speak} />
              ))
            )}
          </div>
        </div>

        {g.feedback && <div className={`feedback ${g.fType}`}>{g.feedback}</div>}

        <div className="section">
          <span className="label">Your Hand</span>
          <div className="tiles">
            {g.hand.map((w, i) => (
              <WordTile key={`h-${i}-${w}`} word={w} glossary={g.glossary[w.toLowerCase()]}
                onTap={() => g.tap(w, i)} onSpeak={g.speak} />
            ))}
          </div>
        </div>

        {g.showVocab && (
          <div className="section">
            <span className="label">Learned Words ({g.vocab.length})</span>
            <div className="tiles">
              {g.vocab.map(v => (
                <div key={v.word} className="v-item" style={{ background: mc(v.cls) + "22" }}>
                  <span className="vw">{v.word}</span>
                  <span className="vf">{v.ok}/{v.seen}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {g.tip && !g.feedback && <span className="tip">{g.tip}</span>}
      </div>

      <div className="bottombar">
        <button className="btn" onClick={g.clearAll}>Clear</button>
        <button className="btn" onClick={g.draw} disabled={g.bank.length === 0 || g.hand.length >= 16}>Draw</button>
        <button className="btn" onClick={g.start}>New Game</button>
        <button className="btn" onClick={() => g.setShowVocab(!g.showVocab)}>
          {g.showVocab ? "Hide" : "Words"}
        </button>
      </div>
    </div>
  );
}
