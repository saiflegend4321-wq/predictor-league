import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page center muted">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}

export function AdminRoute({ children }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <div className="page center muted">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}
