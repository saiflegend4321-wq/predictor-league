import { SCORING_RULES, PENALTY_RULE, LOCK_RULE, FAVOURITE_RULE } from "../lib/scoringRules";

export default function Rules() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>Full Rules</h1>
        <p>Everything you need to know before predicting.</p>
      </div>

      <div className="card">
        <h3>Favourite Teams</h3>
        <p className="muted">{FAVOURITE_RULE}</p>
      </div>

      <div className="card mt-24">
        <h3>Scoring</h3>
        <p className="muted">
          Every match you predict is scored once the final result is in. Here's exactly how points
          are calculated:
        </p>
        <div className="rules-list mt-12">
          {SCORING_RULES.map((r) => (
            <div key={r.id} className="rule-item">
              <div className="rule-points">{r.points}+</div>
              <div className="rule-text">
                <strong>{r.label}</strong>
                <span>{r.description}</span>
              </div>
            </div>
          ))}
          <div className="rule-item">
            <div className="rule-points">0</div>
            <div className="rule-text">
              <strong>Incorrect prediction</strong>
              <span>You predicted a winner, but a different team won (or you predicted a draw that didn't happen). No points.</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-24">
        <h3>Penalty Shootouts</h3>
        <p className="muted">{PENALTY_RULE}</p>
      </div>

      <div className="card mt-24">
        <h3>Locking & Deadlines</h3>
        <p className="muted">{LOCK_RULE}</p>
      </div>

      <div className="card mt-24">
        <h3>Leaderboard Tiebreaks</h3>
        <p className="muted">
          Managers are ranked by total points. If two managers are tied on points, the manager with
          more correctly predicted matches ranks higher. If still tied, they share the same rank.
        </p>
      </div>
    </div>
  );
}
