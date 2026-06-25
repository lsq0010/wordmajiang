export default function WordTile({ word, glossary, isSentence, onTap, onSpeak }) {
  const g = glossary || {};
  return (
    <div className={`tile ${isSentence ? "st" : "pt"}`} onClick={onTap}>
      <div className="t-word">
        {word}
        <span className="t-spk" onClick={(e) => { e.stopPropagation(); onSpeak(word); }}>🔊</span>
      </div>
      {g.cn && <div className="t-cn">{g.cn}</div>}
      {g.note && <div className="t-note">{g.note}</div>}
    </div>
  );
}
