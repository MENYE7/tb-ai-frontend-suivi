/**
 * lib/demoFlag.ts
 *
 * Drapeau « mode démo » côté navigateur. Il est posé par <DemoProvider>
 * (components/DemoProvider.tsx) pendant son rendu, donc AVANT que les pages
 * enfants ne lancent leurs requêtes : lib/api.ts et lib/casesClient.ts
 * l'utilisent pour choisir entre le serveur et les données simulées locales.
 */
let demo = false;

export function setDemoFlag(value: boolean): void {
  demo = value;
}

export function isDemoClient(): boolean {
  return demo;
}
