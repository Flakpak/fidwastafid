import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../../components/SiteHeader.js";
import { SiteFooter } from "../../components/SiteFooter.js";
import { GET as getCompteHandler } from "../api/v1/deals/compte/route.js";
import { GET as getEnseignesHandler } from "../api/v1/enseignes/route.js";

const DESCRIPTION =
  "Fidwastafid est une plateforme communautaire 100% marocaine de bons plans, promotions et bonnes affaires : chaque Marocain qui trouve une bonne promo la partage avec la communauté.";

export const metadata: Metadata = {
  title: "Le concept",
  description: DESCRIPTION,
  alternates: { canonical: "/concept" },
  openGraph: { title: "Le concept Fidwastafid", description: DESCRIPTION, url: "/concept" },
};

/**
 * SSR par requête : les chiffres de cette page sont relus en base à chaque
 * affichage. Un pré-rendu statique les figerait au build, c'est-à-dire
 * rendrait à nouveau faux un nombre écrit une fois — le défaut même que ce
 * lot corrige.
 */
export const dynamic = "force-dynamic";

const NOMBRE = new Intl.NumberFormat("fr-FR");

/**
 * Statistiques de /concept — CONTRAT-V1 §8, règle 5.
 *
 * FAIT GÉNÉRATEUR : cette page a affiché « +50 Enseignes » et « +20 Villes »
 * pendant toute la v2, écrits en dur, sans source. La base portait 9 enseignes
 * et une seule ville réelle, et l'enum `VILLES` plafonne à 9 valeurs : « +20 »
 * était inatteignable par construction. Troisième occurrence du motif après le
 * hero du lot 4 et ses « 184 deals actifs / 27 enseignes / 4 210 membres ».
 *
 * DEUX RÈGLES, gravées ici parce que c'est le fichier qui les a violées :
 *
 *  1. **Aucun arrondi flatteur.** On écrit « 9 enseignes », jamais « +5 » ni
 *     « ~10 ». Un chiffre vrai qui grandit tout seul raconte mieux l'histoire
 *     qu'un chiffre rond que personne ne peut vérifier.
 *  2. **Un chiffre trop bas se RETIRE, il ne se gonfle pas.** C'est le sort de
 *     la tuile « Villes » : les deals publiés ne portent aujourd'hui qu'une
 *     seule ville réelle (Casablanca) — `National` n'est pas une ville
 *     (`packages/schemas/src/enums.ts`) et les deals en ligne n'en ont pas.
 *     « 1 ville » n'est pas une statistique, donc la tuile n'existe plus.
 *
 * Pas de repli silencieux (`docs/INCIDENTS.md`) : si un comptage échoue, la
 * tuile DISPARAÎT et l'échec est journalisé. Elle n'affiche jamais `0` ni une
 * valeur par défaut — un zéro affiché serait une nouvelle affirmation fausse,
 * et c'est exactement ce que cette page a déjà fait une fois.
 */
interface Stat {
  num: string;
  label: string;
}

/**
 * Un `Error.message` seul ne suffit pas ici : la panne la plus probable de ce
 * chemin est une base injoignable, que `pg` remonte en `AggregateError` dont
 * le `message` est la CHAÎNE VIDE. Journaliser `err.message` tel quel produit
 * « indisponible — . », c'est-à-dire une trace qui ne dit pas pourquoi —
 * la version « journal » du repli silencieux (`docs/INCIDENTS.md`). Constaté
 * en vérification locale, sans Postgres démarré.
 */
function decrireErreur(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const code = (err as { code?: unknown }).code;
  const causes =
    err instanceof AggregateError
      ? err.errors.map((e) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e))).join(" | ")
      : "";
  return [err.name, code ? `code=${String(code)}` : "", err.message, causes].filter(Boolean).join(" ");
}

/**
 * Appel direct des handlers de route, comme le feed (`app/page.tsx`) : pas de
 * base URL à deviner selon l'environnement, et le chiffre annoncé sort de la
 * même porte que celle du web et du mobile (CONTRAT-V1 §4).
 *
 * `GET /api/v1/deals/compte` sans paramètre renvoie le nombre de deals que
 * `GET /api/v1/deals` renverrait, donc les `publie` (statut par défaut) — la
 * définition la plus honnête de « ce que le site montre ».
 */
async function compterDealsPublies(): Promise<number | null> {
  try {
    const response = await getCompteHandler(new Request("http://localhost/api/v1/deals/compte"));
    if (!response.ok) {
      console.error(`[concept] comptage des deals indisponible — HTTP ${response.status}. Statistique masquée.`);
      return null;
    }
    return ((await response.json()) as { total: number }).total;
  } catch (err) {
    console.error(
      `[concept] comptage des deals indisponible — ${decrireErreur(err)}. Statistique masquée.`
    );
    return null;
  }
}

/**
 * « Enseignes suivies », pas « enseignes » tout court : `GET /api/v1/enseignes`
 * renvoie la table curée à la main, dont trois entrées ne portent aucun deal
 * publié à ce jour. Le libellé dit donc ce que le nombre compte réellement —
 * ce que nous suivons — plutôt que de laisser croire à neuf enseignes
 * approvisionnées.
 */
async function compterEnseignes(): Promise<number | null> {
  try {
    const response = await getEnseignesHandler();
    if (!response.ok) {
      console.error(`[concept] comptage des enseignes indisponible — HTTP ${response.status}. Statistique masquée.`);
      return null;
    }
    return ((await response.json()) as { data: unknown[] }).data.length;
  } catch (err) {
    console.error(
      `[concept] comptage des enseignes indisponible — ${decrireErreur(err)}. Statistique masquée.`
    );
    return null;
  }
}

async function chargerStats(): Promise<Stat[]> {
  const [deals, enseignes] = await Promise.all([compterDealsPublies(), compterEnseignes()]);

  const stats: Stat[] = [];
  if (deals !== null) stats.push({ num: NOMBRE.format(deals), label: deals === 1 ? "Deal publié" : "Deals publiés" });
  if (enseignes !== null) {
    stats.push({ num: NOMBRE.format(enseignes), label: enseignes === 1 ? "Enseigne suivie" : "Enseignes suivies" });
  }
  // Seule constante légitime du lot : ce n'est pas une mesure, c'est le
  // modèle économique. Il ne peut pas se démentir en base.
  stats.push({ num: "100%", label: "Gratuit" });
  return stats;
}

const ETAPES = [
  {
    num: 1,
    fr: "Tu trouves une لهميزة",
    ar: "لقيتي لهميزة ديالك",
    desc: "En faisant tes courses en magasin ou en ligne. Si ça t'a fait économiser, ça peut faire économiser tout le monde.",
    descAr: "وانت كتدير مشترياتك فالحانوت أو فالنت. إلا وفرتي، يمكن كل الناس توفر.",
  },
  {
    num: 2,
    fr: "Tu la partages en 30 sec",
    ar: "شاركيها مع الجماعة",
    desc: "Prix, magasin, ville — notre équipe vérifie et publie. Tu construis ta réputation de chasseur de bons plans.",
    descAr: "الثمن، الحانوت، المدينة — الفريق ديالنا كيتحقق وكينشر. كتبني سمعتك بحال الخبير فلهميزات.",
  },
  {
    num: 3,
    fr: "La communauté vote",
    ar: "الجماعة تقيّم",
    desc: "ربح = deal intéressant, fonce. خسارة = à éviter. Les meilleures لهميزات remontent en tête automatiquement.",
    descAr: "ربح = لهميزة مزيانة، سير. خسارة = خليها. لهميزات الأحسن كاتصعد لفوق بشكل أوتوماتيكي.",
  },
];

/** Bloc titre de section — porté depuis ConceptPage/Section (index.html racine, v1). */
function Section({
  label,
  titreFr,
  titreAr,
  children,
}: {
  label: string;
  titreFr: string;
  titreAr?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-11">
      <p className="text-[10px] font-extrabold tracking-[2px] uppercase text-accent mb-1.5">{label}</p>
      <h2 className="text-xl md:text-[22px] font-black leading-tight mb-1">{titreFr}</h2>
      {titreAr && (
        <p dir="rtl" className="font-arabic text-accent text-lg mb-4">
          {titreAr}
        </p>
      )}
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-muted font-semibold leading-relaxed mb-2.5">{children}</p>;
}

function PAr({ children }: { children: React.ReactNode }) {
  return (
    <p dir="rtl" className="font-arabic text-ink-subtle text-lg leading-loose mb-2.5">
      {children}
    </p>
  );
}

export default async function ConceptPage() {
  const stats = await chargerStats();

  return (
    <div className="min-h-screen bg-surface-base text-ink">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-6 py-10 md:py-14">
        {/* Hero — clair (charte Tadelakt : aucun encart coloré). */}
        <div className="relative overflow-hidden bg-surface border border-border rounded-2xl px-9 py-10 text-center mb-12">
          <p dir="rtl" className="font-arabic text-accent text-4xl md:text-5xl leading-tight mb-2">
            فيدوستافيد
          </p>
          <p className="text-sm text-ink-muted font-semibold mb-1.5">Fidwastafid — بون بلان ديالك، فيدة للجماعة</p>
          <p dir="rtl" className="font-arabic text-ink-subtle text-lg">
            شارك لهميزات ديالك و خلي غيرك يستافيد
          </p>
        </div>

        <Section
          label="Le concept"
          titreFr="Les bons plans du Maroc, par les Marocains"
          titreAr="لهميزات ديال المغرب، من عند المغاربة"
        >
          <P>
            Fidwastafid est une plateforme communautaire 100% marocaine dédiée aux bons plans, promotions et bonnes
            affaires au Maroc. L&apos;idée est simple : chaque Marocain qui trouve une bonne promo la partage avec
            toute la communauté.
          </P>
          <P>
            Que ce soit chez Marjane, BIM, Carrefour, Jumia ou dans n&apos;importe quelle boutique de ton quartier —
            si tu as trouvé <strong>لهميزة</strong>, partage-la !
          </P>
          <PAr>
            فيدوستافيد هي منصة مجتمعية مغربية 100% للبون بلان والعروض والتخفيضات فالمغرب. الفكرة بسيطة: كل مغربي لي
            لقا عرض مزيان يشاركو مع الجماعة.
          </PAr>
          <PAr>سواء عند مرجان، بيم، كارفور، جوميا ولا فأي حانوت فحيك — إلا لقيتي لهميزة، شاركيها!</PAr>
        </Section>

        {/* Rangée souple et non `grid-cols-3` : le nombre de tuiles dépend
            désormais des comptages qui ont abouti. Une grille à trois colonnes
            fixes laisserait un trou à la place d'une statistique masquée. */}
        <div className="flex flex-wrap gap-3.5 mb-11">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex-1 basis-0 min-w-[132px] bg-surface border border-border rounded-2xl px-3.5 py-5 text-center"
            >
              <p className="text-2xl font-black text-ink tabular-nums mb-1">{s.num}</p>
              <p className="text-[10px] font-extrabold text-ink-subtle uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        <Section
          label="Nos valeurs"
          titreFr="فيد و ستافيد — Partage et fais profiter"
          titreAr="التعاون والمشاركة هما روح المنصة"
        >
          <P>
            Fidwastafid est construit sur un principe simple emprunté à la sagesse marocaine :{" "}
            <strong>ce qui profite à un seul peut profiter à tous</strong>. Chaque deal partagé, c&apos;est une
            famille qui économise sur ses courses, un étudiant qui trouve le bon smartphone moins cher, une mère qui
            gère mieux son budget.
          </P>
          <PAr>
            فيدوستافيد مبنية على مبدأ بسيط من الحكمة المغربية: اللي ينفع واحد يمكن ينفع الجميع. كل لهميزة كتشاركيها،
            كاين عايلة توفر فالمشتريات، كاين طالب لقا الهاتف بثمن أرخص، كاين ماما تدبر ميزانيتها بشكل أحسن.
          </PAr>
          <div className="bg-surface-subtle border-l-4 border-l-accent rounded-r-xl px-5 py-4 my-5">
            <p className="italic text-[15px] font-bold mb-1.5">
              &quot;Les meilleures لهميزات sont celles qu&apos;on partage&quot;
            </p>
            <p dir="rtl" className="font-arabic text-accent text-lg">
              لهميزة المزيانة هي اللي كتشاركيها
            </p>
          </div>
        </Section>

        <Section label="Comment ça marche" titreFr="Simple comme bonjour" titreAr="بساطة كاملة">
          {ETAPES.map((step) => (
            <div key={step.num} className="flex gap-4 bg-surface border border-border rounded-2xl p-5 mb-3">
              <span className="w-[38px] h-[38px] shrink-0 rounded-[10px] bg-ink text-surface-base flex items-center justify-center text-lg font-black">
                {step.num}
              </span>
              <div className="flex-1">
                <p className="text-sm font-extrabold mb-0.5">
                  {step.fr} —{" "}
                  <span dir="rtl" className="font-arabic text-accent text-base">
                    {step.ar}
                  </span>
                </p>
                <p className="text-xs text-ink-muted font-semibold leading-relaxed mb-1">{step.desc}</p>
                <p dir="rtl" className="font-arabic text-ink-subtle text-sm leading-relaxed">
                  {step.descAr}
                </p>
              </div>
            </div>
          ))}
        </Section>

        <div className="bg-surface border border-border rounded-2xl px-8 py-7 text-center">
          <p dir="rtl" className="font-arabic text-accent text-2xl mb-2">
            فيد و ستافيد
          </p>
          <p className="text-sm text-ink-muted font-semibold mb-5">
            Rejoins la communauté et partage ta première لهميزة !
          </p>
          <Link
            href="/"
            className="inline-block bg-accent text-white rounded-xl px-8 py-3 text-sm font-black shadow-sm hover:bg-accent-hi transition-colors duration-[130ms] motion-reduce:transition-none"
          >
            Voir les deals →
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
