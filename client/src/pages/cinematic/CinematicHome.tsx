import { useRef } from "react";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { HeroAct } from "./acts/HeroAct";
import { ChapterAct } from "./acts/ChapterAct";
import { ManifestoAct } from "./acts/ManifestoAct";
import { ExplodedAct } from "./acts/ExplodedAct";
import { DatacenterAct } from "./acts/DatacenterAct";
import { TelemetryAct } from "./acts/TelemetryAct";
import { CTAAct } from "./acts/CTAAct";

export function CinematicHome() {
  const shellRef = useRef<HTMLDivElement>(null);
  return (
    <CinematicLayout>
      <div ref={shellRef}>
        <HeroAct />
        <ManifestoAct />
        <ChapterAct />
        <ExplodedAct />
        <DatacenterAct />
        <TelemetryAct />
        <CTAAct />
      </div>
    </CinematicLayout>
  );
}
