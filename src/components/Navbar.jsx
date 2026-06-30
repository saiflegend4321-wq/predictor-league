import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <header className="navbar">
      <NavLink to="/" className="brand" style={{ color: "inherit" }}>
        ⚽ World Cup Predictor
      </NavLink>
      <nav>
        <NavLink to="/rules">Rules</NavLink>
        <NavLink to="/fixtures">Fixtures</NavLink>
        <NavLink to="/leaderboard">Leaderboard</NavLink>
        {user && <NavLink to="/leagues">Leagues</NavLink>}
        {user && <NavLink to="/my-team">My Team</NavLink>}
        {isAdmin && <NavLink to="/admin">Admin <span className="badge-admin">A</span></NavLink>}
        {user ? (
          <button onClick={handleSignOut}>Sign out</button>
        ) : (
          <NavLink to="/auth" className="btn small">Sign in</NavLink>
        )}
      </nav>
    </header>
  );
}
