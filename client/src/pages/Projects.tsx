import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/site/Layout";
import { siteConfig } from "@/lib/siteConfig";
import { ArrowRight, Sparkles, ExternalLink } from "lucide-react";
import { useSEO } from "@/lib/useSEO";

const categories = [
  { value: "all", label: "All" },
  { value: "networking", label: "Networking" },
  { value: "simulation", label: "Simulation" },
  { value: "web", label: "Web" },
];

export function Projects() {
  useSEO({
    title: "Projects | Max Doubin",
    description:
      "Projects by Max Doubin in cybersecurity, enterprise networking, 3D datacenter simulation, and web development.",
    canonical: "https://maxdoubin.com/projects",
  });

  const [activeCategory, setActiveCategory] = useState("all");

  const filteredProjects =
    activeCategory === "all"
      ? siteConfig.projects
      : siteConfig.projects.filter((p) => p.category === activeCategory);

  return (
    <Layout>
      <div className="pb-16 pt-4">
        <h1
          className="text-3xl font-bold text-foreground"
          data-testid="text-projects-title"
        >
          Projects
        </h1>
        <p className="mt-2 text-muted-foreground">
          Things I have built and am building.
        </p>

        <div className="mt-6 flex flex-wrap gap-2" data-testid="project-filters">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                activeCategory === cat.value
                  ? "bg-primary text-primary-foreground"
                  : "border border-border/50 bg-accent/50 text-foreground hover:bg-accent"
              }`}
              data-testid={`button-filter-${cat.value}`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-6">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="group overflow-hidden rounded-xl border border-border/50 bg-card/50 transition-colors hover:border-border"
              data-testid={`card-project-${project.id}`}
            >
              {project.coverImage && (
                <div className="aspect-[3/1] overflow-hidden">
                  <img
                    src={project.coverImage}
                    alt={project.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
              )}
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      {project.title}
                    </h2>
                    <p className="mt-2 text-muted-foreground leading-relaxed">
                      {project.description}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {project.tech.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-accent/70 px-2.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-5">
                  {project.isGame ? (
                    <Link
                      href={project.link}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      data-testid={`button-play-${project.id}`}
                    >
                      <Sparkles className="h-4 w-4" /> Play the Game{" "}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : project.link ? (
                    <Link
                      href={project.link}
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                      data-testid={`link-project-${project.id}`}
                    >
                      View Project <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredProjects.length === 0 && (
          <div
            className="mt-12 text-center text-muted-foreground"
            data-testid="text-no-projects"
          >
            No projects found in this category.
          </div>
        )}
      </div>
    </Layout>
  );
}
