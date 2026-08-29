import { useEffect, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

/*
  Whether this visitor should be served the WebGL hero at all.

  The home page pulls 804 KB of three.js and react-three-fiber for the
  scrolling rack scene, which is over half of the 1.5 MB of JavaScript the
  page loads on a phone. That is a fair price on a good connection for the
  most distinctive thing on the site, and a bad one on a metered or weak
  connection where it buys a visitor nothing but wait.

  SystemsAct already has a designed, hand written static fallback for
  `prefers-reduced-motion`, and because the scene is behind `lazy()` the
  chunk is never fetched when that fallback renders. This widens the same
  escape hatch to visitors who have told the browser they are constrained.

  Deliberately narrow. Only explicit signals count:

    Save-Data      the visitor asked for less data, in as many words.
    2g / slow-2g   804 KB is tens of seconds here.

  Device memory is left out on purpose. It would catch a large slice of
  perfectly capable mid range Android phones, and downgrading the hero for
  them on a guess is worse than the bytes.
*/

type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

function readConnection(): NetworkInformation | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

function isConstrained(): boolean {
  const connection = readConnection();
  if (!connection) return false;
  if (connection.saveData === true) return true;
  const effective = connection.effectiveType;
  return effective === "2g" || effective === "slow-2g";
}

export function useHeavySceneAllowed(): boolean {
  const reducedMotion = useReducedMotion();
  const [constrained, setConstrained] = useState(isConstrained);

  useEffect(() => {
    const connection = readConnection();
    if (!connection?.addEventListener) return;
    const handler = () => setConstrained(isConstrained());
    // Effective type is re-estimated as the visitor moves between networks.
    connection.addEventListener("change", handler);
    return () => connection.removeEventListener?.("change", handler);
  }, []);

  return !reducedMotion && !constrained;
}
