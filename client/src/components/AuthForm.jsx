import { useState } from "react";
import { t } from "../i18n";

function loadCreds() {
  try {
    return JSON.parse(localStorage.getItem("wm_creds") || "{}");
  } catch { return {}; }
}

export default function AuthForm({ onAuth, uiLang }) {
  const lang = uiLang || "zh-CN";
  const saved = loadCreds();
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState(saved.username || "");
  const [password, setPassword] = useState(saved.password || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const nativeLang = localStorage.getItem("wm_nativeLang") || "zh-CN";
      const targetLang = localStorage.getItem("wm_targetLang") || "en-US";
      const r = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password: password.trim(), nativeLang, targetLang }),
      });
      const d = await r.json();
      if (!r.ok) { setError(t(lang, d.error) || t(lang, "failed")); return; }
      try { localStorage.setItem("wm_creds", JSON.stringify({ username: username.trim(), password })); } catch {}
      onAuth(d.token, d.user);
    } catch {
      setError(t(lang, "errNetwork"));
    } finally {
      setLoading(false);
    }
  };

  const isRegister = mode === "register";

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">{t(lang, "appTitle")}</h1>
        <p className="auth-sub">{t(lang, "appSub")}</p>
        <form className="auth-form" onSubmit={submit}>
          <input
            className="auth-input"
            placeholder={t(lang, "username")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="auth-input"
            type="password"
            placeholder={t(lang, "password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <div className="auth-error">{error}</div>}
          <button className="auth-btn" disabled={loading} type="submit">
            {loading ? t(lang, "loadingBtn") : isRegister ? t(lang, "register") : t(lang, "login")}
          </button>
        </form>
        <div className="auth-switch">
          {isRegister ? (
            <>{t(lang, "haveAccount")} <span onClick={() => { setMode("login"); setError(""); }}>{t(lang, "login")}</span></>
          ) : (
            <>{t(lang, "noAccount")} <span onClick={() => { setMode("register"); setError(""); }}>{t(lang, "register")}</span></>
          )}
        </div>
      </div>
    </div>
  );
}
