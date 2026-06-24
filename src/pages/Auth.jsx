import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Auth() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState("signin"); // 'signin' | 'signup'
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      if (mode === "signup") {
        await signUpWithEmail(email, password, name);
        setInfo("Account created! Check your email to confirm, then sign in.");
        setMode("signin");
      } else {
        await signInWithEmail(email, password);
        navigate("/");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <div className="card form-card">
        <h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
        <p className="muted">
          {mode === "signin" ? "Sign in to make your predictions." : "Join the league and start predicting."}
        </p>

        {error && <div className="error-banner">{error}</div>}
        {info && <div className="success-banner">{info}</div>}

        <button className="btn google" style={{ width: "100%" }} onClick={handleGoogle} type="button">
          Continue with Google
        </button>

        <div className="muted center mt-12" style={{ fontSize: "0.8rem" }}>— or —</div>

        <form onSubmit={handleSubmit} className="mt-12">
          {mode === "signup" && (
            <div className="field">
              <label htmlFor="name">Display name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Your name" />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
          </div>
          <button className="btn" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="muted mt-24 center">
          {mode === "signin" ? (
            <>Don&apos;t have an account?{" "}
              <button onClick={() => setMode("signup")} style={{ background: "none", border: "none", color: "var(--blue)", cursor: "pointer", padding: 0 }}>
                Register
              </button>
            </>
          ) : (
            <>Already have an account?{" "}
              <button onClick={() => setMode("signin")} style={{ background: "none", border: "none", color: "var(--blue)", cursor: "pointer", padding: 0 }}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
