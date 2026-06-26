import { useState } from "react";

export default function AuthForm({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Failed"); return; }
      onAuth(d.token, d.user);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const isRegister = mode === "register";

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">文字麻将</h1>
        <p className="auth-sub">Vocab Builder</p>
        <form className="auth-form" onSubmit={submit}>
          <input
            className="auth-input"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
          <input
            className="auth-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <div className="auth-error">{error}</div>}
          <button className="auth-btn" disabled={loading} type="submit">
            {loading ? "Loading..." : isRegister ? "Register" : "Login"}
          </button>
        </form>
        <div className="auth-switch">
          {isRegister ? (
            <>Have an account? <span onClick={() => { setMode("login"); setError(""); }}>Login</span></>
          ) : (
            <>No account? <span onClick={() => { setMode("register"); setError(""); }}>Register</span></>
          )}
        </div>
      </div>
    </div>
  );
}
