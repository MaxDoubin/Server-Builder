import { useRef } from "react";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { HeroAct } from "./acts/HeroAct";
import { ChapterAct } from "./acts/ChapterAct";
import { ManifestoAct } from "./acts/ManifestoAct";

export function CinematicHome() {
  const shellRef = useRef<HTMLDivElement>(null);
  return (
    <CinematicLayout>
      <div ref={shellRef}>
        <HeroAct />
        <ManifestoAct />
        <ChapterAct />
      </div>
    </CinematicLayout>
  );
}
