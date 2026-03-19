import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── CONFIG SUPABASE ───────────────────────────────────────────────
// Remplace ces deux valeurs par celles de ton projet Supabase
// (Settings → API dans le dashboard Supabase)
const SUPABASE_URL = "https://laqwgehhedvxaqucmeeh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pTmj1luXr1jVb1rdAm2uzw_me78zTjc";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── DONNÉES MOCK (utilisées tant que Supabase n'est pas connecté) ─
const MOCK_DEALS = [
  {
    id: 1,
    titre: "Huile Cristal 5L",
    magasin: "Marjane",
    ville: "Casablanca",
    categorie: "Alimentaire",
    prix_promo: 89,
    prix_normal: 115,
    photo_url: null,
    score: 47,
    statut: "validé",
    type: "physique",
    description: "Promo valable ce weekend dans tous les Marjane. Montre ce deal à la caisse.",
    date_fin: "2026-03-23",
    created_at: "2026-03-19T09:00:00Z",
  },
  {
    id: 2,
    titre: "Aspirateur Rowenta X-Force",
    magasin: "Jumia",
    ville: "National",
    categorie: "Électroménager",
    prix_promo: 1790,
    prix_normal: 2490,
    photo_url: null,
    score: 83,
    statut: "validé",
    type: "online",
    description: "Livraison gratuite. Paiement à la livraison disponible. Stock limité.",
    lien: "https://jumia.ma",
    date_fin: "2026-03-20",
    created_at: "2026-03-19T07:30:00Z",
  },
  {
    id: 3,
    titre: "Poulet entier congelé",
    magasin: "BIM",
    ville: "Rabat",
    categorie: "Alimentaire",
    prix_promo: 29,
    prix_normal: 38,
    photo_url: null,
    score: 31,
    statut: "validé",
    type: "physique",
    description: "Prix au kg. Disponible dans tous les BIM du Maroc jusqu'à 20h ce soir.",
    date_fin: "2026-03-19",
    created_at: "2026-03-19T11:00:00Z",
  },
  {
    id: 4,
    titre: "Smartphone Samsung A15",
    magasin: "Avito",
    ville: "Marrakech",
    categorie: "High-Tech",
    prix_promo: 1350,
    prix_normal: 1899,
    photo_url: null,
    score: 19,
    statut: "validé",
    type: "online",
    description: "Déballé, jamais utilisé. Vendeur particulier — vérifier avant achat.",
    lien: "https://avito.ma",
    date_fin: null,
    created_at: "2026-03-18T15:00:00Z",
  },
  {
    id: 5,
    titre: "Détergent Tide 4kg",
    magasin: "Carrefour",
    ville: "Casablanca",
    categorie: "Maison",
    prix_promo: 64,
    prix_normal: 89,
    photo_url: null,
    score: 22,
    statut: "validé",
    type: "physique",
    description: "En promotion dans les Carrefour Market et Carrefour Express.",
    date_fin: "2026-03-25",
    created_at: "2026-03-18T10:00:00Z",
  },
  {
    id: 6,
    titre: "AirPods Pro 2ème gen",
    magasin: "AliExpress",
    ville: "National",
    categorie: "High-Tech",
    prix_promo: 890,
    prix_normal: 1499,
    photo_url: null,
    score: 64,
    statut: "validé",
    type: "online",
    description: "Vendeur FR → livraison Maroc 12-18 jours. Code promo MAROC10 à appliquer.",
    lien: "https://aliexpress.com",
    date_fin: "2026-03-26",
    created_at: "2026-03-17T18:00:00Z",
  },
];

const VILLES = ["Toutes les villes", "Casablanca", "Rabat", "Marrakech", "Fès", "Tanger", "National"];
const CATEGORIES = ["Toutes", "Alimentaire", "Électroménager", "High-Tech", "Maison", "Mode", "Sport"];
const TRIS = [
  { value: "score", label: "Les plus chauds" },
  { value: "recent", label: "Les plus récents" },
  { value: "remise", label: "Meilleure remise" },
];

// ─── UTILITAIRES ───────────────────────────────────────────────────
function calcRemise(promo, normal) {
  return Math.round(((normal - promo) / normal) * 100);
}

function formatPrix(p) {
  return p.toLocaleString("fr-MA") + " MAD";
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 3600) return Math.round(diff / 60) + "min";
  if (diff < 86400) return Math.round(diff / 3600) + "h";
  return Math.round(diff / 86400) + "j";
}

function isExpiringSoon(dateStr) {
  if (!dateStr) return false;
  const diff = (new Date(dateStr) - Date.now()) / (1000 * 3600);
  return diff >= 0 && diff < 24;
}

// ─── ICÔNES ────────────────────────────────────────────────────────
const IconFlame = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C9 6 7 9 10 12c-4-1-5-4-4-7C3 8 2 12 4 15c2 4 5 6 8 6s6-2 8-6c2-3 1-7-2-10-1 3-3 5-6 4 3-3 2-6 0-7z"/>
  </svg>
);

const IconSnow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11 2v3.2l-2.8-2.8-1.4 1.4 2.8 2.8H6.5l1-1.7-1.7-1-1 1.7H2v2h4.1l-1.8 3.1 1.7 1 1.8-3.1v3.9h2V9.2l1.8 3.1 1.7-1L11.5 8H13v2h2V7.8l1 1.7 1.7-1-1-1.7H21v-2h-2.8l2.8-2.8-1.4-1.4L17 3.2V2h-2v3.9L13.2 3H11zM5.1 13l-1.7 1L5.1 17H2v2h3.1l-2.8 2.8 1.4 1.4 2.8-2.8V22h2v-2.7l1.7 2.9 1.7-1-1.7-2.9h2.3v-2H8.3l1.7-2.9-1.7-1-1.8 3.1V15H11v-2H8.9l1.8-3.1-1.7-1L7.1 13H5.1zm10.8 0l-1.9 3.3-1.8-3.1-1.7 1 1.8 3.1H10v2h2.3l-1.7 2.9 1.7 1 1.7-2.9V22h2v-2.2l2.8 2.8 1.4-1.4-2.8-2.8H22v-2h-3.1l1.8-3.1-1.7-1-1.8 3.1V15H15v-1.7l-1.8-3.1-1.7 1 1.8 3.1H15v-1z"/>
  </svg>
);

const IconShare = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);

const IconClose = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconArrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M7 17L17 7M17 7H7M17 7v10"/>
  </svg>
);

// ─── BADGE CATÉGORIE ───────────────────────────────────────────────
const CATEGORIE_COLORS = {
  Alimentaire: { bg: "#fef3c7", color: "#92400e" },
  Électroménager: { bg: "#dbeafe", color: "#1e40af" },
  "High-Tech": { bg: "#f3e8ff", color: "#6b21a8" },
  Maison: { bg: "#d1fae5", color: "#065f46" },
  Mode: { bg: "#fce7f3", color: "#9d174d" },
  Sport: { bg: "#ffedd5", color: "#9a3412" },
};

function CategorieBadge({ cat }) {
  const c = CATEGORIE_COLORS[cat] || { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{
      background: c.bg, color: c.color,
      fontSize: 10, fontWeight: 700,
      padding: "2px 7px", borderRadius: 20,
      letterSpacing: 0.3,
    }}>
      {cat}
    </span>
  );
}

// ─── SCORE BADGE ───────────────────────────────────────────────────
function ScoreBadge({ score }) {
  const hot = score >= 50;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      padding: "4px 10px", borderRadius: 20,
      background: hot ? "#fef2f2" : "#eff6ff",
      color: hot ? "#dc2626" : "#2563eb",
      fontWeight: 800, fontSize: 13,
      border: `1px solid ${hot ? "#fecaca" : "#bfdbfe"}`,
    }}>
      {hot ? <IconFlame /> : <IconSnow />}
      {score}°
    </div>
  );
}

// ─── CARD DEAL ─────────────────────────────────────────────────────
function DealCard({ deal, onClick, onVote, userVotes }) {
  const remise = calcRemise(deal.prix_promo, deal.prix_normal);
  const expireBientot = isExpiringSoon(deal.date_fin);
  const voted = userVotes[deal.id];

  return (
    <div
      onClick={() => onClick(deal)}
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        transition: "transform 0.12s, box-shadow 0.12s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* IMAGE / PLACEHOLDER */}
      <div style={{
        height: 120,
        background: deal.type === "online"
          ? "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)"
          : "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative",
      }}>
        <span style={{ fontSize: 40 }}>
          {deal.categorie === "Alimentaire" ? "🛒"
            : deal.categorie === "Électroménager" ? "🏠"
            : deal.categorie === "High-Tech" ? "📱"
            : deal.categorie === "Maison" ? "🧹"
            : "🔥"}
        </span>

        {/* Badges overlay */}
        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 4 }}>
          <span style={{
            background: "#dc2626", color: "#fff",
            fontSize: 11, fontWeight: 800,
            padding: "2px 8px", borderRadius: 20,
          }}>
            -{remise}%
          </span>
          {deal.type === "online" && (
            <span style={{
              background: "#1d4ed8", color: "#fff",
              fontSize: 10, fontWeight: 700,
              padding: "2px 7px", borderRadius: 20,
            }}>
              En ligne
            </span>
          )}
        </div>

        {expireBientot && (
          <div style={{
            position: "absolute", top: 8, right: 8,
            background: "#f59e0b", color: "#fff",
            fontSize: 10, fontWeight: 700,
            padding: "2px 8px", borderRadius: 20,
            animation: "pulse 1.5s infinite",
          }}>
            ⚡ Expire bientôt
          </div>
        )}
      </div>

      {/* BODY */}
      <div style={{ padding: "12px 14px" }}>
        {/* Magasin + ville */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 4,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280" }}>
            {deal.magasin} · {deal.ville}
          </span>
          <CategorieBadge cat={deal.categorie} />
        </div>

        {/* Titre */}
        <div style={{
          fontWeight: 800, fontSize: 14, color: "#111827",
          marginBottom: 8, lineHeight: 1.3,
        }}>
          {deal.titre}
        </div>

        {/* Prix */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
          <span style={{ fontWeight: 900, fontSize: 20, color: "#dc2626" }}>
            {formatPrix(deal.prix_promo)}
          </span>
          <span style={{
            textDecoration: "line-through", fontSize: 13,
            color: "#9ca3af", fontWeight: 500,
          }}>
            {formatPrix(deal.prix_normal)}
          </span>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderTop: "1px solid #f3f4f6", paddingTop: 10,
        }}>
          {/* Votes */}
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={e => { e.stopPropagation(); onVote(deal.id, "chaud"); }}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 8px", borderRadius: 8, border: "none",
                cursor: "pointer", fontSize: 12, fontWeight: 700,
                background: voted === "chaud" ? "#fef2f2" : "#f9fafb",
                color: voted === "chaud" ? "#dc2626" : "#6b7280",
                transition: "all 0.12s",
              }}
            >
              🔥 Chaud
            </button>
            <button
              onClick={e => { e.stopPropagation(); onVote(deal.id, "froid"); }}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 8px", borderRadius: 8, border: "none",
                cursor: "pointer", fontSize: 12, fontWeight: 700,
                background: voted === "froid" ? "#eff6ff" : "#f9fafb",
                color: voted === "froid" ? "#2563eb" : "#6b7280",
                transition: "all 0.12s",
              }}
            >
              ❄️ Froid
            </button>
          </div>

          {/* Score + temps */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ScoreBadge score={deal.score} />
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              {timeAgo(deal.created_at)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL FICHE DEAL ──────────────────────────────────────────────
function DealModal({ deal, onClose, onVote, userVotes }) {
  if (!deal) return null;
  const remise = calcRemise(deal.prix_promo, deal.prix_normal);
  const voted = userVotes[deal.id];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff", borderRadius: 20,
          width: "100%", maxWidth: 480,
          maxHeight: "90vh", overflowY: "auto",
          position: "relative",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header image */}
        <div style={{
          height: 180,
          background: "linear-gradient(135deg, #fef2f2, #fee2e2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "20px 20px 0 0",
          position: "relative",
        }}>
          <span style={{ fontSize: 64 }}>
            {deal.categorie === "Alimentaire" ? "🛒"
              : deal.categorie === "Électroménager" ? "🏠"
              : deal.categorie === "High-Tech" ? "📱"
              : "🔥"}
          </span>
          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 12, right: 12,
              width: 32, height: 32, borderRadius: "50%",
              background: "rgba(0,0,0,0.3)", border: "none",
              cursor: "pointer", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <IconClose />
          </button>
          <div style={{
            position: "absolute", top: 12, left: 12,
            background: "#dc2626", color: "#fff",
            fontSize: 14, fontWeight: 900,
            padding: "4px 12px", borderRadius: 20,
          }}>
            -{remise}%
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "20px 24px 24px" }}>
          {/* Magasin + catégorie */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
          }}>
            <span style={{
              background: "#f3f4f6", color: "#374151",
              fontSize: 12, fontWeight: 700,
              padding: "3px 10px", borderRadius: 20,
            }}>
              {deal.magasin}
            </span>
            <CategorieBadge cat={deal.categorie} />
            <span style={{ fontSize: 12, color: "#9ca3af" }}>📍 {deal.ville}</span>
          </div>

          {/* Titre */}
          <h2 style={{
            fontSize: 22, fontWeight: 900, color: "#111827",
            marginBottom: 16, lineHeight: 1.3,
          }}>
            {deal.titre}
          </h2>

          {/* Prix block */}
          <div style={{
            background: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: 12, padding: "16px 20px", marginBottom: 16,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 2 }}>
                PRIX PROMO
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#dc2626" }}>
                {formatPrix(deal.prix_promo)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 2 }}>
                ÉCONOMIE
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#059669" }}>
                -{formatPrix(deal.prix_normal - deal.prix_promo)}
              </div>
              <div style={{
                textDecoration: "line-through", fontSize: 13,
                color: "#9ca3af",
              }}>
                {formatPrix(deal.prix_normal)}
              </div>
            </div>
          </div>

          {/* Description */}
          <p style={{
            fontSize: 14, color: "#374151", lineHeight: 1.7,
            marginBottom: 20,
          }}>
            {deal.description}
          </p>

          {/* Date fin */}
          {deal.date_fin && (
            <div style={{
              background: "#fffbeb", border: "1px solid #fde68a",
              borderRadius: 8, padding: "8px 12px",
              fontSize: 13, color: "#92400e", fontWeight: 600,
              marginBottom: 20,
            }}>
              ⏰ Valable jusqu'au {new Date(deal.date_fin).toLocaleDateString("fr-MA", {
                day: "numeric", month: "long",
              })}
            </div>
          )}

          {/* CTA */}
          <div style={{ display: "flex", gap: 10 }}>
            {deal.lien ? (
              <a
                href={deal.lien}
                target="_blank"
                rel="noopener"
                style={{
                  flex: 1, display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 6,
                  background: "#dc2626", color: "#fff",
                  padding: "14px 20px", borderRadius: 12,
                  fontWeight: 800, fontSize: 15,
                  textDecoration: "none",
                }}
              >
                Voir le deal <IconArrow />
              </a>
            ) : (
              <div style={{
                flex: 1, background: "#dc2626", color: "#fff",
                padding: "14px 20px", borderRadius: 12,
                fontWeight: 800, fontSize: 14, textAlign: "center",
                lineHeight: 1.4,
              }}>
                📍 Deal physique — en magasin
              </div>
            )}
            <button
              onClick={() => navigator.share?.({
                title: deal.titre,
                text: `Deal DealMaroc : ${deal.titre} à ${deal.prix_promo} MAD (-${remise}%)`,
              })}
              style={{
                padding: "14px 16px", borderRadius: 12,
                background: "#f3f4f6", border: "none",
                cursor: "pointer", color: "#374151",
                display: "flex", alignItems: "center",
              }}
            >
              <IconShare />
            </button>
          </div>

          {/* Votes */}
          <div style={{
            display: "flex", gap: 8, marginTop: 16,
            borderTop: "1px solid #f3f4f6", paddingTop: 16,
          }}>
            <button
              onClick={() => onVote(deal.id, "chaud")}
              style={{
                flex: 1, padding: "10px", borderRadius: 10, border: "none",
                cursor: "pointer", fontWeight: 800, fontSize: 14,
                background: voted === "chaud" ? "#fef2f2" : "#f9fafb",
                color: voted === "chaud" ? "#dc2626" : "#6b7280",
                transition: "all 0.12s",
              }}
            >
              🔥 Chaud
            </button>
            <ScoreBadge score={deal.score} />
            <button
              onClick={() => onVote(deal.id, "froid")}
              style={{
                flex: 1, padding: "10px", borderRadius: 10, border: "none",
                cursor: "pointer", fontWeight: 800, fontSize: 14,
                background: voted === "froid" ? "#eff6ff" : "#f9fafb",
                color: voted === "froid" ? "#2563eb" : "#6b7280",
                transition: "all 0.12s",
              }}
            >
              ❄️ Froid
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── APP PRINCIPALE ────────────────────────────────────────────────
export default function App() {
  const [deals, setDeals] = useState(MOCK_DEALS);
  const [loading, setLoading] = useState(false);
  const [usingSupabase, setUsingSupabase] = useState(false);

  const [filtreVille, setFiltreVille] = useState("Toutes les villes");
  const [filtreCategorie, setFiltreCategorie] = useState("Toutes");
  const [filtreType, setFiltreType] = useState("tous");
  const [tri, setTri] = useState("score");
  const [recherche, setRecherche] = useState("");

  const [dealSelectionne, setDealSelectionne] = useState(null);
  const [userVotes, setUserVotes] = useState({});

  // ── Chargement Supabase ──────────────────────────────────────────
  useEffect(() => {
    if (SUPABASE_URL.includes("XXXXXXXXXXXXXXXX")) return; // Pas encore configuré

    setLoading(true);
    supabase
      .from("deals")
      .select("*")
      .eq("statut", "validé")
      .order("score", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error("Supabase error:", error);
        } else if (data && data.length > 0) {
          setDeals(data);
          setUsingSupabase(true);
        }
        setLoading(false);
      });
  }, []);

  // ── Vote ─────────────────────────────────────────────────────────
  const handleVote = async (dealId, type) => {
    const existing = userVotes[dealId];
    if (existing === type) return; // Déjà voté pareil

    const delta = type === "chaud"
      ? (existing === "froid" ? 2 : 1)
      : (existing === "chaud" ? -2 : -1);

    setUserVotes(prev => ({ ...prev, [dealId]: type }));
    setDeals(prev =>
      prev.map(d => d.id === dealId ? { ...d, score: Math.max(0, d.score + delta) } : d)
    );

    if (usingSupabase) {
      const deal = deals.find(d => d.id === dealId);
      await supabase
        .from("votes")
        .upsert({ deal_id: dealId, type, created_at: new Date().toISOString() });
      await supabase
        .from("deals")
        .update({ score: deal.score + delta })
        .eq("id", dealId);
    }
  };

  // ── Filtrage + tri ───────────────────────────────────────────────
  const dealsFiltres = deals
    .filter(d => {
      if (filtreVille !== "Toutes les villes" && d.ville !== filtreVille && d.ville !== "National") return false;
      if (filtreCategorie !== "Toutes" && d.categorie !== filtreCategorie) return false;
      if (filtreType === "physique" && d.type !== "physique") return false;
      if (filtreType === "online" && d.type !== "online") return false;
      if (recherche && !d.titre.toLowerCase().includes(recherche.toLowerCase())
        && !d.magasin.toLowerCase().includes(recherche.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (tri === "score") return b.score - a.score;
      if (tri === "recent") return new Date(b.created_at) - new Date(a.created_at);
      if (tri === "remise") return calcRemise(b.prix_promo, b.prix_normal) - calcRemise(a.prix_promo, a.prix_normal);
      return 0;
    });

  return (
    <div style={{ minHeight: "100vh", background: "#f8f6f2", fontFamily: "'Nunito', sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Noto+Naskh+Arabic:wght@400;700&display=swap');
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.6 } }
        * { box-sizing: border-box; }
      `}</style>

      {/* ── TOPBAR ── */}
      <div style={{
        background: "#fff", borderBottom: "2px solid #f3f4f6",
        padding: "0 20px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      }}>
        <div style={{
          background: "#dc2626", borderRadius: 12,
          padding: "5px 14px",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{
            fontFamily: "'Noto Naskh Arabic', serif",
            fontSize: 18, fontWeight: 700, color: "#fff",
          }}>
            فيد و ستافيد
          </span>
          <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.7)" }}>
            Fidwastafid
          </span>
        </div>

        <div style={{
          flex: 1, maxWidth: 320, margin: "0 16px",
        }}>
          <input
            type="text"
            placeholder="Rechercher un deal, un magasin..."
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            style={{
              width: "100%", padding: "8px 14px", borderRadius: 20,
              border: "1px solid #e5e7eb", outline: "none",
              fontSize: 13, background: "#f9fafb",
            }}
          />
        </div>

        <div style={{
          background: usingSupabase ? "#d1fae5" : "#fef3c7",
          color: usingSupabase ? "#065f46" : "#92400e",
          fontSize: 11, fontWeight: 700,
          padding: "4px 10px", borderRadius: 20,
        }}>
          {usingSupabase ? "🟢 Supabase" : "🟡 Mode démo"}
        </div>
      </div>

      {/* ── FILTRES ── */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #f3f4f6",
        padding: "10px 20px",
        display: "flex", gap: 8, flexWrap: "wrap",
        alignItems: "center",
      }}>
        {/* Ville */}
        <select
          value={filtreVille}
          onChange={e => setFiltreVille(e.target.value)}
          style={{
            padding: "6px 12px", borderRadius: 20,
            border: "1px solid #e5e7eb", fontSize: 12, fontWeight: 700,
            cursor: "pointer", background: "#fff",
          }}
        >
          {VILLES.map(v => <option key={v}>{v}</option>)}
        </select>

        {/* Catégorie */}
        <select
          value={filtreCategorie}
          onChange={e => setFiltreCategorie(e.target.value)}
          style={{
            padding: "6px 12px", borderRadius: 20,
            border: "1px solid #e5e7eb", fontSize: 12, fontWeight: 700,
            cursor: "pointer", background: "#fff",
          }}
        >
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>

        {/* Type physique/online */}
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { value: "tous", label: "Tous" },
            { value: "physique", label: "🏪 Physique" },
            { value: "online", label: "🌐 En ligne" },
          ].map(t => (
            <button
              key={t.value}
              onClick={() => setFiltreType(t.value)}
              style={{
                padding: "6px 12px", borderRadius: 20, border: "none",
                cursor: "pointer", fontSize: 12, fontWeight: 700,
                background: filtreType === t.value ? "#dc2626" : "#f3f4f6",
                color: filtreType === t.value ? "#fff" : "#6b7280",
                transition: "all 0.12s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>Trier :</span>
          <select
            value={tri}
            onChange={e => setTri(e.target.value)}
            style={{
              padding: "6px 12px", borderRadius: 20,
              border: "1px solid #e5e7eb", fontSize: 12, fontWeight: 700,
              cursor: "pointer", background: "#fff",
            }}
          >
            {TRIS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── CONTENU PRINCIPAL ── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 20px 60px" }}>

        {/* Stats bar */}
        <div style={{
          display: "flex", gap: 16, marginBottom: 20,
          fontSize: 13, color: "#6b7280", fontWeight: 600,
        }}>
          <span>{dealsFiltres.length} deal{dealsFiltres.length !== 1 ? "s" : ""} trouvé{dealsFiltres.length !== 1 ? "s" : ""}</span>
          {!usingSupabase && (
            <span style={{
              background: "#fef3c7", color: "#92400e",
              padding: "2px 8px", borderRadius: 20, fontSize: 11,
            }}>
              Données de démonstration · Connecte Supabase pour les vraies données
            </span>
          )}
        </div>

        {/* Grid deals */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>
            Chargement des deals...
          </div>
        ) : dealsFiltres.length === 0 ? (
          <div style={{
            textAlign: "center", padding: 60,
            background: "#fff", borderRadius: 16,
            border: "1px solid #f3f4f6",
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <div style={{ fontWeight: 700, color: "#374151", marginBottom: 4 }}>Aucun deal trouvé</div>
            <div style={{ color: "#9ca3af", fontSize: 13 }}>Essaie d'autres filtres</div>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}>
            {dealsFiltres.map(deal => (
              <DealCard
                key={deal.id}
                deal={deal}
                onClick={setDealSelectionne}
                onVote={handleVote}
                userVotes={userVotes}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── MODAL ── */}
      {dealSelectionne && (
        <DealModal
          deal={dealSelectionne}
          onClose={() => setDealSelectionne(null)}
          onVote={(id, type) => {
            handleVote(id, type);
            setDealSelectionne(prev =>
              prev
                ? { ...prev, score: Math.max(0, prev.score + (type === "chaud" ? 1 : -1)) }
                : null
            );
          }}
          userVotes={userVotes}
        />
      )}
    </div>
  );
}
