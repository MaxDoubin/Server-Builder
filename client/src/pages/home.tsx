import { Link } from "wouter";
import { routes } from "@/lib/routes";

const menuItems = [
  {
    title: "Hyperscale Game",
    description: "Launch the immersive datacenter simulator.",
    href: routes.game,
  },
  {
    title: "About",
    description: "Learn about the platform vision and roadmap.",
    href: routes.about,
  },
];

export function Home() {
  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-hero__content">
          <p className="home-hero__eyebrow">Main Menu</p>
          <h1 className="home-hero__title">Design, build, and run hyperscale systems.</h1>
          <p className="home-hero__subtitle">
            Command the datacenter, explore live telemetry, and launch the HyperScale simulator.
          </p>
          <div className="home-hero__actions">
            <Link className="home-cta" href={routes.game}>
              Enter Hyperscale
            </Link>
            <Link className="home-cta home-cta--ghost" href={routes.about}>
              Learn more
            </Link>
          </div>
        </div>
        <div className="home-hero__visual" aria-hidden="true">
          <div className="home-hero__grid home-hero__panel" />
          <div className="home-hero__pulse home-hero__core" />
          <div className="home-hero__scan home-hero__scanline" />
        </div>
      </section>

      <section className="home-menu" aria-label="Main menu">
        {menuItems.map((item) => (
          <Link key={item.title} href={item.href} className="home-card">
            <div className="home-card__title">{item.title}</div>
            <div className="home-card__desc">{item.description}</div>
          </Link>
        ))}
        <div className="home-card home-card--static" aria-hidden="true">
          <div className="home-card__title">New modules</div>
          <div className="home-card__desc">Power, cooling, and network packs are ready.</div>
        </div>
      </section>
    </div>
  );
}
