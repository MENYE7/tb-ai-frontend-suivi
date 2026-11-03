import { DemoBanner } from "@/components/DemoBanner";
import { DemoProvider } from "@/components/DemoProvider";
import { Navbar } from "@/components/Navbar";
import { isDemoMode } from "@/lib/demo";

/**
 * app/(main)/layout.tsx
 *
 * S'applique à /analyze, /cases, /dashboard, /batch — PAS à /login ni /setup
 * (en dehors de ce groupe de routes). Le nom entre parenthèses n'apparaît
 * jamais dans l'URL (convention Next.js des "route groups").
 *
 * `force-dynamic` : le mode démo dépend de variables d'environnement lues à
 * chaque requête, pas figées au moment du build.
 */
export const dynamic = "force-dynamic";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const demo = isDemoMode();
  return (
    <DemoProvider demo={demo}>
      {demo && <DemoBanner />}
      <Navbar demo={demo} />
      {children}
    </DemoProvider>
  );
}
