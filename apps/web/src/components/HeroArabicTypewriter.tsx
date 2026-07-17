"use client";

import { useEffect, useState } from "react";

const TAGLINE_AR = "فيد و ستافيد — شارك لهميزات ديالك و خلي غيرك يستافد 🔥";

/**
 * Effet machine à écrire, porté tel quel depuis HeroBand (index.html
 * racine, v1) : révélation caractère par caractère via setInterval, pas de
 * CSS `steps()` — un `width` animé en pur CSS clipperait le texte arabe à
 * mi-glyphe (les lettres se lient entre elles), ce qui casserait le rendu
 * des ligatures. Composant client minimal et isolé (CONTRAT-V1 lot D) :
 * seul ce fragment hydrate, le reste du hero (FR + étapes) reste statique.
 */
export function HeroArabicTypewriter() {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setDisplayed(TAGLINE_AR.slice(0, i));
        if (i >= TAGLINE_AR.length) {
          clearInterval(interval);
          setTimeout(() => setDone(true), 600);
        }
      }, 35);
      return () => clearInterval(interval);
    }, 400);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="font-arabic text-muted text-xl leading-relaxed" dir="rtl">
      {displayed}
      {!done && <span aria-hidden="true" className="hero-cursor" />}
    </div>
  );
}
