"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tbai:expertName";
const SYNC_EVENT = "tbai:expertName:changed";

/**
 * lib/useExpertName.ts
 *
 * ⚠️ Ceci N'EST PAS une authentification. C'est un simple champ texte
 * persisté dans le localStorage du navigateur, pour savoir QUI a cliqué
 * "Confirmer/Rejeter" (cf. components/FeedbackButtons.tsx). N'importe qui
 * ayant accès à cet appareil peut le modifier librement.
 *
 * Pour une vraie étude de validation multi-utilisateurs nécessitant un
 * audit trail opposable, remplacer ceci par une authentification réelle
 * (ex. NextAuth) avant de considérer les données de feedback comme fiables.
 */
export function useExpertName(): [string, (name: string) => void] {
  const [name, setNameState] = useState<string>("");

  useEffect(() => {
    const read = () => {
      try {
        setNameState(window.localStorage.getItem(STORAGE_KEY) ?? "");
      } catch {
        /* stockage indisponible : on garde la valeur en mémoire */
      }
    };
    read();
    // Plusieurs composants (barre du haut, fenêtre d'un cas) utilisent ce hook :
    // l'événement les garde synchronisés sans rechargement.
    window.addEventListener(SYNC_EVENT, read);
    return () => window.removeEventListener(SYNC_EVENT, read);
  }, []);

  const setName = useCallback((value: string) => {
    setNameState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignoré */
    }
    window.dispatchEvent(new Event(SYNC_EVENT));
  }, []);

  return [name, setName];
}
