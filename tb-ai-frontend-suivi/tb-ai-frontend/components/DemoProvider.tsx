"use client";

import { createContext, useContext } from "react";
import { setDemoFlag } from "@/lib/demoFlag";

const DemoContext = createContext(false);

/**
 * Pose le drapeau « mode démo » PENDANT le rendu (et non dans un effet) :
 * les effets des pages enfants s'exécutent avant ceux de leurs parents, et
 * lib/api.ts doit déjà connaître le mode quand elles chargent leurs données.
 */
export function DemoProvider({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  setDemoFlag(demo);
  return <DemoContext.Provider value={demo}>{children}</DemoContext.Provider>;
}

export function useDemo(): boolean {
  return useContext(DemoContext);
}
