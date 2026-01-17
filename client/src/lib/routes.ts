export const routes = {
  home: "/",
  game: "/game",
  about: "/about",
} as const;

export const navItems = [
  { href: routes.home, label: "Home" },
  { href: routes.game, label: "Hyperscale Game" },
  { href: routes.about, label: "About" },
] as const;
