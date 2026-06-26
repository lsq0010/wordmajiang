export default function WordTile({ word, glossary, isSentence, onTap }) {
  const g = glossary || {};
  const m = typeof g.mastery === "number" ? g.mastery : null;
  const mc = m != null ? m >= 1 ? "var(--m-green)" : m >= 0.5 ? "var(--m-blue)" : "var(--m-red)" : null;
  return (
    <div className={`tile ${isSentence ? "st" : "pt"}`} onClick={onTap}>
      <div className="t-word">
        {word}
        <span className="t-spk">🔈</span>
      </div>
      {g.ipa && <div className="t-ipa">{g.ipa}</div>}
      {g.cn && <div className="t-cn">{g.cn}</div>}
      {g.note && <div className="t-note">{g.note}</div>}
      {m != null && <div className="t-mastery" style={{ color: mc }}>{m.toFixed(2)}</div>}
    </div>
  );
}
