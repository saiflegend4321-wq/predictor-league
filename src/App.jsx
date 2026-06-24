import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import { ProtectedRoute, AdminRoute } from "./components/ProtectedRoute";

import Home from "./pages/Home";
import Rules from "./pages/Rules";
import Auth from "./pages/Auth";
import Fixtures from "./pages/Fixtures";
import MyTeam from "./pages/MyTeam";
import Leaderboard from "./pages/Leaderboard";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/leaderboard" element={<Leaderboard />} />

        <Route
          path="/fixtures"
          element={
            <ProtectedRoute>
              <Fixtures />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-team"
          element={
            <ProtectedRoute>
              <MyTeam />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <Admin />
            </AdminRoute>
          }
        />

        <Route path="*" element={<div className="page center muted">Page not found</div>} />
      </Routes>
    </div>
  );
}
