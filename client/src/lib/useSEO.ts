import { useEffect } from "react";
import { trimTitle } from "@/lib/pageTitle";

const SITE_URL = "https://maxdoubin.com";
const DEFAULT_TITLE =
  "Max Doubin | Cybersecurity Student, Las Vegas";
const DEFAULT_DESC =
  "Max Doubin, cybersecurity student in Las Vegas. Top 1 percent National Cyber League, CompTIA Tech plus, and field notes on networking, servers, and security.";
const DEFAULT_IMAGE = `${SITE_URL}/images/og-image.jpg`;
const DEFAULT_CANONICAL = SITE_URL;
const DEFAULT_OG_TYPE = "profile";

interface SEOProps {
  title: string;
  description: string;
  canonical: string;
  ogType?: string;
  ogImage?: string;
  ogImageAlt?: string;
  /** Optional JSON-LD schema object to inject into <head>. Pass null to skip. */
  schema?: Record<string, unknown> | null;
  /** Unique id for the injected <script> tag so it can be cleaned up. */
  schemaId?: string;
  /**
   * Keep this page out of the index.
   *
   * For interactive tool pages that carry almost no readable content. They
   * would otherwise be crawled as thin pages competing with the writing.
   */
  noindex?: boolean;
}

function setMeta(selector: string, attr: string, value: string) {
  const el = document.querySelector(selector);
  el?.setAttribute(attr, value);
}

export function useSEO({
  title,
  description,
  canonical,
  ogType = "website",
  ogImage = DEFAULT_IMAGE,
  ogImageAlt = "Max Doubin",
  schema = null,
  schemaId,
  noindex = false,
}: SEOProps) {
  useEffect(() => {
    // Same rule the prerenderer applies, so the client does not
    // rewrite the title a crawler was already served.
    const shown = trimTitle(title);
    document.title = shown;

    setMeta('meta[name="description"]', "content", description);
    setMeta('link[rel="canonical"]', "href", canonical);
    setMeta(
      'meta[name="robots"]',
      "content",
      noindex ? "noindex, follow" : "index, follow",
    );

    // Open Graph
    setMeta('meta[property="og:title"]', "content", shown);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", canonical);
    setMeta('meta[property="og:type"]', "content", ogType);
    setMeta('meta[property="og:image"]', "content", ogImage);
    setMeta('meta[property="og:image:alt"]', "content", ogImageAlt);

    // Twitter
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description);
    setMeta('meta[name="twitter:image"]', "content", ogImage);
    setMeta('meta[name="twitter:url"]', "content", canonical);

    // Page-specific JSON-LD schema
    if (schema && schemaId) {
      document.getElementById(schemaId)?.remove();
      const script = document.createElement("script");
      script.id = schemaId;
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    }

    return () => {
      document.title = DEFAULT_TITLE;
      setMeta('meta[name="description"]', "content", DEFAULT_DESC);
      setMeta('link[rel="canonical"]', "href", DEFAULT_CANONICAL);
      setMeta('meta[name="robots"]', "content", "index, follow");
      setMeta('meta[property="og:title"]', "content", DEFAULT_TITLE);
      setMeta('meta[property="og:description"]', "content", DEFAULT_DESC);
      setMeta('meta[property="og:url"]', "content", DEFAULT_CANONICAL);
      setMeta('meta[property="og:type"]', "content", DEFAULT_OG_TYPE);
      setMeta('meta[property="og:image"]', "content", DEFAULT_IMAGE);
      setMeta('meta[property="og:image:alt"]', "content", "Max Doubin, cybersecurity student");
      setMeta('meta[name="twitter:title"]', "content", DEFAULT_TITLE);
      setMeta('meta[name="twitter:description"]', "content", DEFAULT_DESC);
      setMeta('meta[name="twitter:image"]', "content", DEFAULT_IMAGE);
      setMeta('meta[name="twitter:url"]', "content", DEFAULT_CANONICAL);
      if (schemaId) document.getElementById(schemaId)?.remove();
    };
  }, [title, description, canonical, ogType, ogImage, ogImageAlt, schema, schemaId, noindex]);
}
