export function About() {
  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-hero__content">
          <p className="home-hero__eyebrow">About</p>
          <h1 className="home-hero__title">A platform for building resilient infrastructure.</h1>
          <p className="home-hero__subtitle">
            Hyperscale is a modular environment for planning, operating, and stress-testing
            datacenter designs. Every layer—from power envelopes to network topology—stays visible,
            measurable, and ready to expand.
          </p>
        </div>
        <div className="home-hero__visual" aria-hidden="true">
          <div className="home-hero__grid home-hero__panel" />
          <div className="home-hero__pulse home-hero__core" />
          <div className="home-hero__scan home-hero__scanline" />
        </div>
      </section>

      <section className="home-menu" aria-label="Platform highlights">
        <div className="home-card home-card--static">
          <div className="home-card__title">Modular architecture</div>
          <div className="home-card__desc">
            Add new operational modules without rewriting the core shell or navigation.
          </div>
        </div>
        <div className="home-card home-card--static">
          <div className="home-card__title">Performance-first</div>
          <div className="home-card__desc">
            Motion is built on GPU-safe transforms and CSS baselines for instant feedback.
          </div>
        </div>
        <div className="home-card home-card--static">
          <div className="home-card__title">Future ready</div>
          <div className="home-card__desc">
            Plug in new visualizations, sensors, and dashboards with predictable layout slots.
          </div>
        </div>
      </section>
    </div>
  );
}
