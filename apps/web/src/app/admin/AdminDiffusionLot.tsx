"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/Button.js";

/**
 * Panneau de diffusion en masse (CONTRAT-V1 §4, dix-neuvième amendement
 * conscient, migration 0021) — onglet « Publiés » : sélection manuelle de
 * deals déjà publiés, envoyés un par un vers Telegram ou Discord, espacés
 * d'un intervalle configurable.
 *
 * PLANCHER DE L'INTERVALLE — mesuré, pas supposé. Telegram documente
 * explicitement (core.telegram.org/bots/faq) : au plus 1 message par
 * seconde DANS UN MÊME CHAT, et au plus 20 messages/minute dans un groupe —
 * exactement notre cas (un seul chat/canal cible). C'est la contrainte
 * CONTRAIGNANTE : 1000 ms est donc le plancher, jamais négociable en deçà.
 * Discord ne publie aucun chiffre officiel par webhook (seulement une
 * limite globale de 50 req/s tous endpoints confondus, documentation
 * officielle consultée le 15/08/2026) — la valeur couramment observée en
 * pratique (5 requêtes / 2 s par webhook) est plus large que le plancher
 * Telegram, donc déjà couverte par lui. Le défaut proposé (3 s) reste
 * large des deux côtés, resserrable jusqu'au plancher sans changement de
 * code — exactement ce qui était demandé.
 */
const INTERVALLE_PLANCHER_S = 1;
const INTERVALLE_DEFAUT_S = 3;

type ModeDiffusion = "production" | "test";
type StatutLotDeal = "en_attente" | "deja_diffuse" | "envoye" | "echoue";

interface LigneLot {
  publicId: string;
  statut: StatutLotDeal;
  messageId: string | null;
  erreur: string | null;
  statutHttp: number | null;
}

interface EtatLot {
  lot: string;
  canal: string;
  mode: ModeDiffusion;
  creeLe: string;
  deals: LigneLot[];
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

const CANAL_LABEL: Record<"telegram" | "discord", string> = { telegram: "Telegram", discord: "Discord" };

const STATUT_LABEL: Record<StatutLotDeal, string> = {
  en_attente: "En attente",
  deja_diffuse: "Déjà diffusé",
  envoye: "Envoyé",
  echoue: "Échec",
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function creerLot(
  canal: "telegram" | "discord",
  mode: ModeDiffusion,
  publicIds: string[]
): Promise<{ ok: true; lot: string } | { ok: false; message: string }> {
  const res = await fetch(`/api/v1/admin/deals/diffuser-lot?canal=${canal}&mode=${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicIds }),
  });
  if (!res.ok) {
    const body = (await res.json()) as ApiErrorBody;
    return { ok: false, message: body.error?.message ?? "Création du lot impossible." };
  }
  const body = (await res.json()) as { lot: string };
  return { ok: true, lot: body.lot };
}

async function fetchLot(lot: string): Promise<EtatLot | null> {
  const res = await fetch(`/api/v1/admin/deals/diffuser-lot/${encodeURIComponent(lot)}`);
  if (!res.ok) return null;
  return (await res.json()) as EtatLot;
}

/**
 * Panneau — deux temps : `config` (choix canal déjà fixé par l'appelant,
 * mode + intervalle + confirmation nommant le nombre ET le canal) puis
 * `progression` (barre d'avancement, pause/reprise, relance des échecs).
 * Le lot existe dès la confirmation cliquée — `creerLot()` fige la liste
 * cible côté serveur à cet instant précis, jamais reconstruite ensuite.
 */
export function AdminDiffusionLot({
  canal,
  publicIds,
  onClose,
}: {
  canal: "telegram" | "discord";
  publicIds: string[];
  onClose: () => void;
}) {
  const [etape, setEtape] = useState<"config" | "creation" | "progression">("config");
  const [mode, setMode] = useState<ModeDiffusion>("production");
  const [intervalleS, setIntervalleS] = useState(INTERVALLE_DEFAUT_S);
  const [erreur, setErreur] = useState<string | null>(null);
  const [etatLot, setEtatLot] = useState<EtatLot | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [messagePause, setMessagePause] = useState<string | null>(null);
  const [idAReprendre, setIdAReprendre] = useState("");

  // Contrôle du client de la boucle — lu au sommet de chaque itération
  // (Pause n'annule jamais un appel réseau déjà parti, elle empêche
  // seulement le SUIVANT de partir).
  const actifRef = useRef(false);

  useEffect(
    () => () => {
      actifRef.current = false;
    },
    []
  );

  function majLigne(publicId: string, patch: Partial<LigneLot>) {
    setEtatLot((prev) =>
      prev ? { ...prev, deals: prev.deals.map((d) => (d.publicId === publicId ? { ...d, ...patch } : d)) } : prev
    );
  }

  async function boucle(lot: string) {
    actifRef.current = true;
    setEnCours(true);
    setMessagePause(null);
    while (actifRef.current) {
      const res = await fetch(`/api/v1/admin/deals/diffuser-lot/${encodeURIComponent(lot)}/suivant`, {
        method: "POST",
      });
      if (!actifRef.current) break;
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        setMessagePause(body.error?.message ?? "Erreur inattendue — arrêté, aucun renvoi au prochain démarrage.");
        break;
      }
      const data = (await res.json()) as
        | { termine: true }
        | { termine: false; publicId: string; statut: "envoye"; messageId: string | null }
        | { termine: false; publicId: string; statut: "echoue"; erreur: string; statutHttp: number | null; limiteDebit: boolean };

      if (data.termine) break;

      if (data.statut === "envoye") {
        majLigne(data.publicId, { statut: "envoye", messageId: data.messageId, erreur: null });
      } else {
        majLigne(data.publicId, { statut: "echoue", erreur: data.erreur, statutHttp: data.statutHttp });
        if (data.limiteDebit) {
          setMessagePause(
            `${CANAL_LABEL[canal]} a répondu « débit limité » (HTTP 429) — arrêté ici, rien de plus n'a été tenté. Attends un peu puis clique « Reprendre ».`
          );
          break;
        }
      }
      await delay(intervalleS * 1000);
    }
    actifRef.current = false;
    setEnCours(false);
  }

  async function lancer() {
    setErreur(null);
    setEtape("creation");
    const r = await creerLot(canal, mode, publicIds);
    if (!r.ok) {
      setErreur(r.message);
      setEtape("config");
      return;
    }
    const lot = await fetchLot(r.lot);
    if (!lot) {
      setErreur("Lot créé mais introuvable juste après — réessaie de le retrouver par son identifiant.");
      setEtape("config");
      return;
    }
    setEtatLot(lot);
    setEtape("progression");
    void boucle(r.lot);
  }

  async function reprendreParId() {
    if (!idAReprendre.trim()) return;
    setErreur(null);
    const lot = await fetchLot(idAReprendre.trim());
    if (!lot) {
      setErreur("Aucun lot ne porte cet identifiant.");
      return;
    }
    setEtatLot(lot);
    setEtape("progression");
  }

  function pause() {
    actifRef.current = false;
    setEnCours(false);
  }

  function reprendre() {
    if (!etatLot) return;
    void boucle(etatLot.lot);
  }

  async function relancerEchecs() {
    if (!etatLot) return;
    const res = await fetch(`/api/v1/admin/deals/diffuser-lot/${encodeURIComponent(etatLot.lot)}/relancer`, {
      method: "POST",
    });
    if (!res.ok) return;
    const frais = await fetchLot(etatLot.lot);
    if (frais) setEtatLot(frais);
  }

  if (etape !== "progression") {
    const messagesRestants = publicIds.length;
    return (
      <div className="bg-surface-subtle border border-border rounded-xl p-4 flex flex-col gap-3">
        <p className="text-sm font-bold text-ink">Diffuser {messagesRestants} deal{messagesRestants > 1 ? "s" : ""} sur {CANAL_LABEL[canal]}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted">
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as ModeDiffusion)}
              className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink"
              disabled={etape === "creation"}
            >
              <option value="production">Production — envoi réel</option>
              <option value="test">Test — canal de test, ne marque rien</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted">
            Intervalle entre deux envois (s)
            <input
              type="number"
              min={INTERVALLE_PLANCHER_S}
              step={1}
              value={intervalleS}
              onChange={(e) => setIntervalleS(Math.max(INTERVALLE_PLANCHER_S, Number(e.target.value) || INTERVALLE_PLANCHER_S))}
              className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink w-24"
              disabled={etape === "creation"}
            />
          </label>
        </div>
        <p className="text-xs text-ink-muted">
          Plancher {INTERVALLE_PLANCHER_S} s — Telegram documente au plus 1 message/seconde dans un même chat ;
          Discord ne publie aucun chiffre par webhook, la pratique observée (5 req/2 s) reste sous ce plancher.
        </p>
        {erreur && <p className="text-warn text-xs font-bold">{erreur}</p>}
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => void lancer()} disabled={etape === "creation"}>
            {etape === "creation"
              ? "Création…"
              : `Confirmer — envoyer ${messagesRestants} message${messagesRestants > 1 ? "s" : ""} sur ${CANAL_LABEL[canal]} (${mode === "production" ? "production" : "test"})`}
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={etape === "creation"}>
            Annuler
          </Button>
        </div>
        <div className="border-t border-border pt-3 flex items-end gap-2">
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted flex-1">
            Reprendre un lot déjà lancé (identifiant)
            <input
              type="text"
              value={idAReprendre}
              onChange={(e) => setIdAReprendre(e.target.value)}
              placeholder="ex. 3f2a1c9e-…"
              className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink font-mono"
            />
          </label>
          <Button variant="secondary" size="sm" onClick={() => void reprendreParId()}>
            Charger
          </Button>
        </div>
      </div>
    );
  }

  if (!etatLot) return null;

  const envoyes = etatLot.deals.filter((d) => d.statut === "envoye").length;
  const dejaDiffuses = etatLot.deals.filter((d) => d.statut === "deja_diffuse").length;
  const echoues = etatLot.deals.filter((d) => d.statut === "echoue").length;
  const enAttente = etatLot.deals.filter((d) => d.statut === "en_attente").length;
  const total = etatLot.deals.length;
  const termine = enAttente === 0 && !enCours;

  return (
    <div className="bg-surface-subtle border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-bold text-ink">
          Lot {CANAL_LABEL[canal]} ({etatLot.mode === "test" ? "test" : "production"}) —{" "}
          {envoyes + dejaDiffuses}/{total} traités, {echoues} échec{echoues > 1 ? "s" : ""}
        </p>
        <code className="text-[11px] text-ink-subtle font-mono">{etatLot.lot}</code>
      </div>

      <div className="h-2 rounded-full bg-border overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${total > 0 ? Math.round(((envoyes + dejaDiffuses + echoues) / total) * 100) : 0}%` }}
        />
      </div>

      {messagePause && <p className="text-warn text-xs font-bold">{messagePause}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        {!termine && enCours && (
          <Button variant="secondary" size="sm" onClick={pause}>
            Mettre en pause
          </Button>
        )}
        {!termine && !enCours && (
          <Button variant="primary" size="sm" onClick={reprendre}>
            Reprendre
          </Button>
        )}
        {echoues > 0 && !enCours && (
          <Button variant="secondary" size="sm" onClick={() => void relancerEchecs()}>
            Relancer les {echoues} échec{echoues > 1 ? "s" : ""}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onClose}>
          Fermer
        </Button>
      </div>

      <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
        {etatLot.deals.map((d) => (
          <li key={d.publicId} className="flex items-center justify-between gap-2 text-xs">
            <code className="font-mono text-ink-subtle">{d.publicId}</code>
            <span
              className={
                d.statut === "echoue"
                  ? "text-hot font-bold"
                  : d.statut === "envoye" || d.statut === "deja_diffuse"
                    ? "text-accent font-semibold"
                    : "text-ink-muted"
              }
              title={d.erreur ?? undefined}
            >
              {STATUT_LABEL[d.statut]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
