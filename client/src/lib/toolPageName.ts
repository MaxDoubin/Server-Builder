/**
 * The page component behind a tool slug, by naming convention.
 *
 * Every tool page lives at client/src/pages/tools/<Name>.tsx and exports a
 * component called <Name>, where <Name> is the slug in PascalCase:
 * "subnet-calculator" is SubnetCalculator and "dhcp-option-121-encoder" is
 * DhcpOption121Encoder. The convention is what lets one route serve every
 * tool without a per-tool line in the entry bundle.
 *
 * Kept in its own module, free of Vite-only syntax, so the router's lazy
 * slug map and scripts-ci/check-palette.ts apply the same rule. A slug whose
 * page is missing or misnamed then fails CI rather than reaching the 404
 * page at a real visitor.
 */
export function toolPageName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}
