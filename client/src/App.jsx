import { useEffect, useState } from "react";
import { useGame } from "./hooks/useGame";
import { t, fetchTranslations, hasTranslations } from "./i18n";
import WordTile from "./components/WordTile";
import HandwriteArea from "./components/HandwriteArea";
import AuthForm from "./components/AuthForm";
import LogoutModal from "./components/LogoutModal";
import LanguageSelect, { langName } from "./components/LanguageSelect";

function getToken() {
  try { return localStorage.getItem("wm_token"); } catch { return null; }
}
function saveAuth(token, user) {
  try {
    localStorage.setItem("wm_token", token);
    localStorage.setItem("wm_user", JSON.stringify(user));
    if (user.nativeLang) localStorage.setItem("wm_nativeLang", user.nativeLang);
    if (user.targetLang) localStorage.setItem("wm_targetLang", user.targetLang);
  } catch {}
}
function clearAuth() {
  try { localStorage.removeItem("wm_token"); localStorage.removeItem("wm_user"); localStorage.removeItem("wm_vocab"); localStorage.removeItem("wm_level"); } catch {}
}

export default function App() {
  const [token, setToken] = useState(getToken);
  const g = useGame(token);
  const [showCn, setShowCn] = useState(() => {
    try { const v = localStorage.getItem("wm_showCn"); return v !== null ? v === "1" : true; }
    catch { return true; }
  });
  const [expandedWord, setExpandedWord] = useState(null);
  const [showHandwrite, setShowHandwrite] = useState(false);
  const [firstRound, setFirstRound] = useState(true);
  const [showLangSelect, setShowLangSelect] = useState(false);
  const [showPreAuthLang, setShowPreAuthLang] = useState(() => {
    try { return !localStorage.getItem("wm_langSet"); } catch { return true; }
  });

  const uiLang = g.nativeLang || "zh-CN";
  const tr = (key) => t(uiLang, key);

  useEffect(() => {
    if (token) g.start();
  }, [token]);

  useEffect(() => {
    if (g.fType === "ok") setFirstRound(false);
  }, [g.fType]);

  useEffect(() => {
    if (g.authError) { clearAuth(); setToken(null); }
  }, [g.authError]);

  useEffect(() => {
    try { localStorage.setItem("wm_showCn", showCn ? "1" : "0"); } catch {}
  }, [showCn]);

  useEffect(() => {
    const lang = g.nativeLang;
    if (lang && !hasTranslations(lang)) {
      fetchTranslations(lang, langName(lang));
    }
  }, [g.nativeLang]);

  const handleAuth = (t, user) => {
    saveAuth(t, user);
    setToken(t);
  };

  if (!token) {
    if (showPreAuthLang) {
      return (
        <LanguageSelect
          nativeLang={uiLang}
          targetLang={g.targetLang}
          uiLang={uiLang}
          onConfirm={(nat, tgt) => {
            try { localStorage.setItem("wm_nativeLang", nat); } catch {}
            try { localStorage.setItem("wm_targetLang", tgt); } catch {}
            try { localStorage.setItem("wm_langSet", "1"); } catch {}
            setShowPreAuthLang(false);
          }}
        />
      );
    }
    return <AuthForm onAuth={handleAuth} uiLang={uiLang} />;
  }

  const mc = (c) => c === "m" ? "var(--m-green)" : c === "f" ? "var(--m-blue)" : "var(--m-red)";

  const reasonCls = g.sentenceType === "consolidate" ? "rc" : g.sentenceType === "introduce" ? "rn" : "";

  return (
    <div className="app">
      {showLangSelect && (
        <LanguageSelect
          nativeLang={g.nativeLang}
          targetLang={g.targetLang}
          uiLang={uiLang}
          onConfirm={(nat, tgt) => { g.setLanguages(nat, tgt); setShowLangSelect(false); g.start(tgt, nat); }}
          onCancel={() => setShowLangSelect(false)}
        />
      )}

      <div className="topbar">
        <div className="topbar-left">
          <span className="title">{tr("appTitle")}</span>
          <span className="lv">{tr("level")}{g.level}</span>
        </div>
        <div className="topbar-right">
          <span className="lang-pill" onClick={() => setShowLangSelect(true)} title={tr("nativeLang")}>
            {langName(g.nativeLang)}
          </span>
          <span className="lang-pill lang-pill-tgt" onClick={() => setShowLangSelect(true)} title={tr("targetLang")}>
            {langName(g.targetLang)}
          </span>
          <div className="stat"><b>{g.score.toFixed(1)}</b><span>{tr("score")}</span></div>
          <div className="stat" onClick={() => g.setShowVocab(!g.showVocab)} style={{cursor:"pointer"}}>
            <b>{g.vocab.length}</b><span>{tr("words")}</span>
          </div>
        </div>
      </div>

      <div className="main-area">
        {g.loading ? (
          <div className="loading">{tr("loading")}</div>
        ) : (<>
        <div className="section">
          <div className={`reason ${reasonCls}`}>
            {g.reason}
            {g.reason && g.sentenceCn ? ' · ' : ''}
            <span onClick={() => setShowCn(!showCn)} style={{cursor:"pointer"}}>
              {g.sentenceCn ? (showCn ? g.sentenceCn : "***") : ''}
            </span>
          </div>
          <div className="tiles">
            {g.hand.map((w, i) => (
              <WordTile key={`h-${i}-${w}`} word={w} glossary={g.getGlossary(w)}
                onTap={() => g.tap(w, i)} />
            ))}
          </div>
        </div>

        {!g.loading && showHandwrite && (
          <HandwriteArea token={token} targetLang={g.targetLang} t={tr} />
        )}

        {firstRound && (
          <div className="tutorial">{tr("tutorial")}</div>
        )}

        {g.tip && !g.feedback && <span className="tip">{g.tip}</span>}
        </>)}
      </div>

      {g.showVocab && (
        <div className="vocab-overlay">
          <div className="vocab-header">
            <span className="vocab-title">{tr("wordBank")} ({g.vocab.length})</span>
            <button className="btn" onClick={() => g.setShowVocab(false)}>{tr("close")}</button>
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
                    {expanded && <span className="vd-mastery">{tr("mastery")} {(v.mastery || 0).toFixed(2)}</span>}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <button className="fab" onClick={() => setShowHandwrite(!showHandwrite)} title={tr("handwriting")}>✎</button>

      <div className="bottombar">
        <LogoutModal onConfirm={() => { clearAuth(); setToken(null); }} uiLang={uiLang} />
        <button className="btn" onClick={() => g.newRound()}>{tr("refresh")}</button>
      </div>
    </div>
  );
}
