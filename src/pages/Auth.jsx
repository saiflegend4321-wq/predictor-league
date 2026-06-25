import { useState, useRef } from "react";
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

  // Tracks the timestamp of the last submission to prevent spam clicks
  const lastSubmitRef = useRef(0);

  async function handleSubmit(e) {
    e.preventDefault();
    
    // Cooldown check: prevent submissions within 5 seconds of each other
    const now = Date.now();
    if (now - lastSubmitRef.current < 5000) {
      setError("Please wait a few seconds before trying again.");
      return;
    }
    lastSubmitRef.current = now;

    setError("");
    setInfo("");
    setLoading(true);

    try {
      if (mode === "signup") {
        if (!name.trim()) throw new Error("Please enter your name.");
        
        await signUpWithEmail(email.trim().toLowerCase(), password, name.trim());
        setInfo("Account created! Check your email to confirm, then sign in.");
        setMode("signin");
      } else {
        await signInWithEmail(email.trim().toLowerCase(), password);
        navigate("/");
      }
    } catch (err) {
      // Better error handling for rate limits
      if (err.message?.toLowerCase().includes("rate limit") || err.message?.includes("429")) {
        setError("Too many registration attempts. Please wait a few minutes before trying again.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    // Prevent clicking Google Auth multiple times
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      await signInWithGoogle();
    } catch (err) {
      if (err.message?.toLowerCase().includes("rate limit") || err.message?.includes("429")) {
        setError("Too many login attempts. Please wait a moment.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
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

        <button 
          className="btn google" 
          style={{ width: "100%" }} 
          onClick={handleGoogle} 
          type="button"
          disabled={loading}
        >
          {loading ? "Please wait..." : "Continue with Google"}
        </button>

        <div className="muted center mt-12" style={{ fontSize: "0.8rem" }}>— or —</div>

        <form onSubmit={handleSubmit} className="mt-12">
          {mode === "signup" && (
            <div className="field">
              <label htmlFor="name">Display name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Your name" disabled={loading} />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" disabled={loading} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" disabled={loading} />
          </div>
          <button className="btn" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="muted mt-24 center">
          {mode === "signin" ? (
            <>Don&apos;t have an account?{" "}
              <button onClick={() => { setMode("signup"); setError(""); setInfo(""); }} style={{ background: "none", border: "none", color: "var(--blue)", cursor: "pointer", padding: 0 }} disabled={loading}>
                Register
              </button>
            </>
          ) : (
            <>Already have an account?{" "}
              <button onClick={() => { setMode("signin"); setError(""); setInfo(""); }} style={{ background: "none", border: "none", color: "var(--blue)", cursor: "pointer", padding: 0 }} disabled={loading}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}