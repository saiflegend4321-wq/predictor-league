/**
 * Skeleton loading placeholders matching real card/row shapes.
 * Usage: <Skeleton.FixtureCard /> or <Skeleton.Row count={5} />
 */

function FixtureCardSkeleton() {
  return (
    <div className="card skeleton-card-wrapper" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
      <div className="skeleton skeleton-line short" style={{ width: 80 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div className="skeleton" style={{ width: 60, height: 60, borderRadius: 10 }} />
        <div className="skeleton" style={{ width: 30, height: 16 }} />
        <div className="skeleton" style={{ width: 60, height: 60, borderRadius: 10 }} />
      </div>
      <div className="skeleton skeleton-line" style={{ width: "70%", margin: "0 auto" }} />
      <div style={{ display: "flex", gap: 8 }}>
        <div className="skeleton" style={{ flex: 1, height: 36, borderRadius: 8 }} />
        <div className="skeleton" style={{ flex: 1, height: 36, borderRadius: 8 }} />
        <div className="skeleton" style={{ flex: 1, height: 36, borderRadius: 8 }} />
      </div>
    </div>
  );
}

function RowSkeleton({ count = 5 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton skeleton-line" style={{ height: 40 }} />
      ))}
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="card stat-card">
      <div className="skeleton skeleton-line short" style={{ height: 11, marginBottom: 10 }} />
      <div className="skeleton skeleton-line" style={{ height: 28, width: "50%" }} />
    </div>
  );
}

const Skeleton = {
  FixtureCard: FixtureCardSkeleton,
  Row: RowSkeleton,
  StatCard: StatCardSkeleton,
};

export default Skeleton;
