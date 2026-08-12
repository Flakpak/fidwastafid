"use client";

import { useState } from "react";

export interface LotResume {
  lot: string;
  debuteLe: string;
  deals: number;
  verbe: string;
  motifRejet: string | null;
}

export type AnnulerLotResult = { ok: true; revertes: number; sautes: number } | { ok: false; message: string };

const VERBE_LABEL: Record<string, string> = {
  publie: "Validé",
  rejete: "Rejeté",
};

/**
 * Ligne d'un lot — deux temps sur « Annuler » (même principe que la
 * suppression douce et l'annulation de diffusion) : un geste qui touche
 * potentiellement des centaines de lignes mérite de nommer ce qu'il
 * touche, pas un clic sec.
 */
function LigneLot({
  resume,
  pending,
  onAnnuler,
}: {
  resume: LotResume;
  pending: boolean;
  onAnnuler: () => Promise<AnnulerLotResult>;
}) {
  const [confirme, setConfirme] = useState(false);
  const [etat, setEtat] = useState<"idle" | "pending" | "fait">("idle");
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ revertes: number; sautes: number } | null>(null);

  async function annuler() {
    setEtat("pending");
    setErreur(null);
    const r = await onAnnuler();
    if (!r.ok) {
      setEtat("idle");
      setConfirme(false);
      setErreur(r.message);
      return;
    }
    setEtat("fait");
    setResultat({ revertes: r.revertes, sautes: r.sautes });
  }

  return (
    <li className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-sm">
            {VERBE_LABEL[resume.verbe] ?? resume.verbe} — {resume.deals} deal{resume.deals > 1 ? "s" : ""}
          </span>
          <span className="text-xs text-ink-muted">
            {new Date(resume.debuteLe).toLocaleString("fr-FR")}
            {resume.motifRejet ? ` — motif : ${resume.motifRejet}` : ""}
          </span>
          <code className="text-[11px] text-ink-subtle font-mono">{resume.lot}</code>
        </div>
        {etat !== "fait" && (
          <button
            type="button"
            onClick={() => (confirme ? void annuler() : setConfirme(true))}
            disabled={pending || etat === "pending"}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer border transition-colors duration-[130ms] disabled:opacity-50 motion-reduce:transition-none flex-shrink-0 ${
              confirme
                ? "border-hot-line bg-surface text-hot hover:bg-hot-soft"
                : "border-border-strong bg-surface text-ink-muted hover:bg-surface-subtle"
            }`}
          >
            {etat === "pending" ? "Annulation..." : confirme ? `Confirmer — annuler les ${resume.deals}` : "Annuler ce lot"}
          </button>
        )}
      </div>
      {erreur && <p className="text-warn text-xs font-bold">{erreur}</p>}
      {resultat && (
        <p className="text-xs text-accent font-semibold">
          {resultat.revertes} deal{resultat.revertes > 1 ? "s" : ""} revenu{resultat.revertes > 1 ? "s" : ""} à leur statut
          d&apos;origine
          {resultat.sautes > 0
            ? ` — ${resultat.sautes} sauté${resultat.sautes > 1 ? "s" : ""} (déjà modifié${resultat.sautes > 1 ? "s" : ""} depuis)`
            : ""}
          .
        </p>
      )}
    </li>
  );
}

/**
 * Onglet « Lots récents » (lot du 12/08/2026) — retrouver un lot d'action
 * groupée (`bulk`/`bulk-filtre`) et le défaire. Sans cet écran, la
 * confirmation au moment de l'action serait le SEUL filet — insuffisant
 * sur un lot de plusieurs centaines de lignes, une erreur découverte après
 * coup doit rester réparable.
 *
 * Placé comme onglet transversal, au même niveau que « Supprimés » (lot 1)
 * — même famille : une vue qui ne correspond à AUCUN statut de deal, mais
 * à une catégorie d'action admin. Aucune nouvelle page/route n'était
 * nécessaire, l'admin n'a qu'un seul écran à connaître.
 */
export function AdminLots({
  lots,
  pending,
  onAnnuler,
}: {
  lots: LotResume[] | null;
  pending: boolean;
  onAnnuler: (lot: string) => Promise<AnnulerLotResult>;
}) {
  if (lots === null) {
    return <p className="text-center text-ink-muted py-16">Chargement…</p>;
  }
  if (lots.length === 0) {
    return <p className="text-center text-ink-muted py-16">Aucun lot d&apos;action groupée récent.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {lots.map((resume) => (
        <LigneLot key={resume.lot} resume={resume} pending={pending} onAnnuler={() => onAnnuler(resume.lot)} />
      ))}
    </ul>
  );
}
