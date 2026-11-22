import type { Categorie } from "@fidwastafid/schemas";

/**
 * Textes des pages hub (lot SEO-3, CONTRAT-V1 §3 vingt-deuxième amendement).
 * Contenu éditorial définitif, fourni par Kamel : à modifier ici seulement,
 * jamais généré.
 *
 * `darija` : bloc rendu dans un élément `lang="ar-MA" dir="rtl"` sous le H1
 * (règle de langue de l'amendement). `null` = pas de bloc.
 */

export interface HubCategorie {
  slug: string;
  categorie: Categorie;
  h1: string;
  intro: string;
  darija: string | null;
}

export const HUBS_CATEGORIES: readonly HubCategorie[] = [
  {
    slug: "maison",
    categorie: "Maison",
    h1: "Promos maison au Maroc",
    intro:
      "Vaisselle, rangement, linge, produits d'entretien : les réductions repérées chez les enseignes au Maroc, triées par remise. Chaque offre affiche le prix d'origine indiqué par l'enseigne.",
    darija: "هميزات الدار: الماعن، الترتيب والتنظيف بأرخص ثمن",
  },
  {
    slug: "electromenager",
    categorie: "Électroménager",
    h1: "Promos électroménager au Maroc",
    intro:
      "Machine à laver, réfrigérateur, four, robot de cuisine, chauffage : les promotions électroménager en cours au Maroc, avec le prix d'origine et la remise.",
    darija: "ماكينة الصابون، التلاجة، الفران… التخفيضات ديال هاد السيمانة",
  },
  {
    slug: "mode",
    categorie: "Mode",
    h1: "Promos mode au Maroc",
    intro:
      "Vêtements, chaussures et accessoires en promotion chez les enseignes présentes au Maroc. La date de fin est indiquée quand l'enseigne la communique.",
    darija: "الحوايج والصبابط بالتخفيض",
  },
  {
    slug: "sport",
    categorie: "Sport",
    h1: "Promos sport au Maroc",
    intro:
      "Fitness, camping, natation, vélo d'appartement : les bons plans sport repérés au Maroc, de la plus forte à la plus faible remise.",
    darija: "هميزات الرياضة والتخييم",
  },
  {
    slug: "high-tech",
    categorie: "High-Tech",
    h1: "Promos high-tech au Maroc",
    intro:
      "Téléviseurs, écouteurs, enceintes et accessoires en promotion au Maroc. Un même produit revient souvent à des prix différents d'une enseigne à l'autre : comparez avant d'acheter.",
    darija: "التلفزة والسماعات بأرخص ثمن",
  },
  {
    slug: "beaute",
    categorie: "Beauté",
    h1: "Promos beauté au Maroc",
    intro:
      "Soins du visage, protection solaire, parfums et hygiène : les réductions beauté et parapharmacie disponibles au Maroc.",
    darija: "تخفيضات ديال العناية والماكياج",
  },
  {
    slug: "fournitures-scolaires",
    categorie: "Fournitures scolaires",
    h1: "Fournitures scolaires en promo au Maroc",
    intro:
      "Crayons, trousses, cahiers et petit matériel de bureau en promotion au Maroc, utiles toute l'année et indispensables à la rentrée.",
    darija: "الأدوات المدرسية بأرخص ثمن",
  },
  {
    slug: "bricolage-jardin",
    categorie: "Bricolage & Jardin",
    h1: "Promos bricolage et jardin au Maroc",
    intro: "Outillage, compresseurs, barbecue et équipement de jardin : les promotions bricolage repérées au Maroc.",
    darija: "هميزات البريكولاج والجردة",
  },
  {
    slug: "enfants-jouets",
    categorie: "Enfants & Jouets",
    h1: "Promos jouets et enfants au Maroc",
    intro: "Jouets, jeux d'éveil et équipement pour enfants en promotion au Maroc.",
    darija: null,
  },
  {
    slug: "telephonie-internet",
    categorie: "Téléphonie & Internet",
    h1: "Promos téléphonie au Maroc",
    intro: "Smartphones, forfaits et offres internet en promotion au Maroc.",
    darija: null,
  },
  {
    slug: "alimentaire",
    categorie: "Alimentaire",
    h1: "Promos alimentaires au Maroc",
    intro: "Épicerie, boissons et produits du quotidien en promotion dans les supermarchés marocains.",
    darija: null,
  },
  {
    slug: "gaming",
    categorie: "Gaming",
    h1: "Promos gaming au Maroc",
    intro: "Consoles, jeux et accessoires gaming en promotion au Maroc.",
    darija: null,
  },
  {
    slug: "voyages",
    categorie: "Voyages",
    h1: "Promos voyages au Maroc",
    intro: "Billets, séjours et offres de voyage au départ ou à destination du Maroc.",
    darija: null,
  },
];

export type SlugEvenement = "black-friday" | "ramadan" | "aid" | "rentree" | "soldes-ete" | "soldes-hiver";

/** Une édition datée d'un événement. Dates au jour de Casablanca, AAAA-MM-JJ. */
export interface EditionEvenement {
  annee: number;
  debut: string;
  fin: string;
  jourJ: string;
  title: string;
  /** Meta description dédiée (jamais l'intro). */
  description: string;
  h1: string;
  intro: string;
  darija: string | null;
  /** Affiché sous l'intro quand l'édition compte moins de SEUIL_INDEXATION_CATEGORIE deals. */
  messagePeuDeDeals: string;
}

export interface HubEvenement {
  slug: SlugEvenement;
  nom: string;
  /** Éditions configurées. Vide = aucune édition : page en noindex. */
  editions: readonly EditionEvenement[];
}

/** Intro de toute page événement hors de la fenêtre d'une édition. */
export const INTRO_HORS_SAISON =
  "La prochaine édition arrive bientôt. En attendant, voici les meilleures promotions du moment.";

export function h1HorsSaison(nom: string): string {
  return `Bons plans ${nom} au Maroc`;
}

export const HUBS_EVENEMENTS: readonly HubEvenement[] = [
  {
    slug: "black-friday",
    nom: "Black Friday",
    editions: [
      {
        annee: 2026,
        debut: "2026-11-01",
        fin: "2026-11-30",
        jourJ: "2026-11-27",
        title: "Black Friday Maroc 2026 : les vraies promos",
        description:
          "Les promos Black Friday au Maroc avec le prix d'origine affiché, triées par remise. Mis à jour chaque jour jusqu'au 30 novembre.",
        messagePeuDeDeals: "Les offres arrivent au fil du mois : revenez avant le 27 novembre.",
        h1: "Black Friday Maroc 2026 : les vraies promos",
        intro:
          "Le Black Friday tombe le vendredi 27 novembre 2026, mais au Maroc les promotions s'étalent sur tout le mois de novembre. On ne garde ici que les offres avec un prix d'origine affiché par l'enseigne, triées par remise. Une remise sans prix d'origine ne prouve rien.",
        darija: "بلاك فرايدي فالمغرب: الهميزات الحقيقية ديال نونبر",
      },
    ],
  },
  { slug: "ramadan", nom: "Ramadan", editions: [] },
  { slug: "aid", nom: "Aïd", editions: [] },
  { slug: "rentree", nom: "Rentrée", editions: [] },
  { slug: "soldes-ete", nom: "Soldes d'été", editions: [] },
  { slug: "soldes-hiver", nom: "Soldes d'hiver", editions: [] },
];
