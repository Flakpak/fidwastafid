/**
 * Contrat commun à tous les canaux de diffusion (Telegram, Discord, et ce qui
 * viendra). Un canal sait faire exactement deux choses : publier un deal, et
 * retirer ce qu'il a publié.
 *
 * POURQUOI CETTE ABSTRACTION MAINTENANT, ET PAS AU PREMIER CANAL : parce
 * qu'il y en a deux. Le premier canal ne prouve rien sur ce qui est commun ;
 * le second le montre. Ce qui est identique entre Telegram et Discord — les
 * gardes (deal publié, non déjà diffusé), l'ordre envoi→écriture, la règle
 * « si la plateforme refuse la suppression, la ligne reste » — vit une seule
 * fois dans `diffusion.ts`. Ce qui diffère — la forme du message, l'API
 * appelée — vit dans l'adaptateur du canal.
 *
 * ERREURS COMMUNES, et c'est le point important : les deux canaux distinguent
 * les mêmes trois cas, parce que l'appelant doit y répondre différemment.
 *   - config absente        → on n'a rien à envoyer (400, message clair)
 *   - la plateforme refuse  → on remonte SON statut et SA description
 *   - succès sans id        → échec franc : sans identifiant, la diffusion
 *                             ne pourra jamais être annulée. Mieux vaut
 *                             échouer maintenant que découvrir plus tard
 *                             qu'un message est indélébile.
 */

/** Variable d'environnement manquante — ce n'est pas la plateforme qui
 *  refuse, c'est nous qui n'avons rien à lui envoyer. */
export class DiffusionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiffusionConfigError";
  }
}

/** La plateforme a refusé. `statut` null = échec réseau/timeout, jamais
 *  confondu avec un refus applicatif. */
export class DiffusionRefusError extends Error {
  constructor(
    message: string,
    readonly statut: number | null,
    readonly description: string | null
  ) {
    super(message);
    this.name = "DiffusionRefusError";
  }
}

/**
 * Destination explicite d'un envoi — CONTRAT-V1 §4, dix-septième amendement
 * conscient (08/08/2026). Remplace l'ancienne préférence ambiante
 * (`_TEST` prime si présente) : celle-ci faisait retomber silencieusement
 * un envoi sur la production dès que `_TEST` manquait — constaté en
 * production le 02/08/2026. `mode` est désormais TOUJOURS explicite, jamais
 * déduit d'une variable d'environnement présente ou absente.
 */
export type ModeDiffusion = "production" | "test";

export interface DealADiffuser {
  titre: string;
  prixPromo: number;
  prixNormal: number | null;
  enseigneNom: string | null;
  /** URL publique de l'image, ou null si le deal n'en a pas. */
  photoUrl: string | null;
  /** URL du deal, UTM du canal déjà appliqués. */
  lien: string;
}

export interface CanalDiffusion {
  /** Valeur écrite dans `diffusions.canal` — la clé de l'anti-double-envoi. */
  readonly nom: string;
  /** Libellé humain, pour les messages d'erreur rendus au curateur. */
  readonly libelle: string;
  /** Vrai si la variable d'environnement de CE mode précis est présente —
   *  jamais « l'une ou l'autre ». */
  estConfigure(mode: ModeDiffusion): boolean;
  /**
   * Publie et renvoie l'identifiant du message **en chaîne** — jamais un
   * nombre : les identifiants Discord dépassent la précision entière de
   * JavaScript (cf. migration 0012). `mode` choisit la destination ; si
   * `mode === "test"` et que la variable `_TEST` du canal est absente,
   * lève `DiffusionConfigError` — jamais un repli vers la production.
   */
  publier(deal: DealADiffuser, mode: ModeDiffusion): Promise<{ messageId: string; test: boolean }>;
  /** Retire un message déjà publié. Lève si la plateforme refuse. Cible
   *  toujours la production (voir CONTRAT-V1 §4, dix-septième amendement —
   *  limite assumée : annuler un envoi de test n'est pas exposé ici). */
  supprimer(messageId: string): Promise<void>;
}
