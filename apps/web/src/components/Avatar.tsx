import type { CouleurAvatar } from "@fidwastafid/schemas";

/** Classe de fond par couleur — exportée pour être réutilisée telle quelle
 *  par le sélecteur de couleur de /compte (mêmes classes, pas de mapping dupliqué). */
export const AVATAR_BG_CLASS: Record<CouleurAvatar, string> = {
  rouge: "bg-avatar-rouge",
  terracotta: "bg-avatar-terracotta",
  or: "bg-avatar-or",
  olive: "bg-avatar-olive",
  bleu: "bg-avatar-bleu",
  indigo: "bg-avatar-indigo",
  prune: "bg-avatar-prune",
  ardoise: "bg-avatar-ardoise",
};

const SIZE_CLASS = {
  sm: "w-4 h-4 text-[9px]",
  md: "w-8 h-8 text-xs",
  lg: "w-9 h-9 text-sm",
  xl: "w-20 h-20 text-3xl",
} as const;

interface AvatarProps {
  pseudo: string;
  /** null si l'auteur a supprimé son compte — l'API replie déjà sur
   *  "ardoise" (lot 1, LEFT JOIN commentaires/deals), ce repli sur "rouge"
   *  ici n'est qu'un filet pour un appelant qui n'aurait pas encore la
   *  donnée (ex. couleurAvatar absent d'un vieux payload en cache). */
  couleurAvatar?: CouleurAvatar | null;
  size?: keyof typeof SIZE_CLASS;
}

/** Avatar cercle à initiale, coloré — référence v1 user-avatar, couleur
 *  réelle du membre depuis le lot 1 (espace membre, CONTRAT-V1 §4). */
export function Avatar({ pseudo, couleurAvatar, size = "md" }: AvatarProps) {
  const bg = AVATAR_BG_CLASS[couleurAvatar ?? "rouge"];
  return (
    <span
      aria-hidden="true"
      className={`${SIZE_CLASS[size]} shrink-0 rounded-full ${bg} text-white flex items-center justify-center font-black`}
    >
      {pseudo[0]?.toUpperCase()}
    </span>
  );
}
