/** The glossary registry. */
import { NETWORKING } from "./data/networking";
import { PROTOCOLS } from "./data/protocols";
import { SYSTEMS } from "./data/systems";
import { SECURITY } from "./data/security";
import { sortKey, type Term } from "./types";

export const TERMS: Term[] = [...NETWORKING, ...PROTOCOLS, ...SYSTEMS, ...SECURITY].sort((a, b) =>
  sortKey(a).localeCompare(sortKey(b)),
);

export const getTerm = (name: string): Term | undefined =>
  TERMS.find((term) => term.term.toLowerCase() === name.toLowerCase());

export * from "./types";
