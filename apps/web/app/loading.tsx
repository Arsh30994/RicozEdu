export default function Loading() {
  return (
    <section className="route-skeleton" aria-label="Loading page" aria-busy="true">
      <div className="skeleton-heading skeleton-shimmer" />
      <div className="skeleton-metrics">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="skeleton-card skeleton-shimmer" key={index}>
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
      <div className="skeleton-content">
        <div className="skeleton-card skeleton-shimmer" />
        <div className="skeleton-card skeleton-shimmer" />
      </div>
      <span className="visually-hidden">Loading content</span>
    </section>
  );
}
