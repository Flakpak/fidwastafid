"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@fidwastafid/auth";
import { getAuthClient } from "./supabaseAuthClient.js";
import { setSessionCookie } from "./sessionCookie.js";
import { SITE_URL } from "./siteUrl.js";

export async function connexionAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const { data, error } = await getAuthClient().auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    redirect("/connexion?erreur=1");
  }

  await setSessionCookie(data.session.access_token, data.session.expires_in);
  redirect("/");
}

/**
 * L'inscription elle-même passe par l'API Supabase Auth directement, pas
 * par /api/v1 (CONTRAT-V1 §4 : liste fermée) — le pseudo fourni ici atterrit
 * dans user_metadata, lu par le provisioning paresseux de packages/auth au
 * premier appel authentifié.
 */
export async function inscriptionAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const pseudo = String(formData.get("pseudo") ?? "").trim();

  const { data, error } = await getAuthClient().auth.signUp({
    email,
    password,
    options: {
      data: pseudo ? { pseudo } : undefined,
      // Dérivé de SITE_URL (par déploiement) plutôt que de compter
      // uniquement sur la "Site URL" unique du dashboard Supabase — le lien
      // de confirmation retombe correctement sur la préversion ET,
      // plus tard, sur fidwastafid.com, à condition que les deux soient
      // dans la liste blanche "Additional Redirect URLs" côté Supabase.
      emailRedirectTo: new URL("/auth/confirm", SITE_URL).toString(),
    },
  });

  if (error) {
    redirect("/inscription?erreur=1");
  }

  if (data.session) {
    await setSessionCookie(data.session.access_token, data.session.expires_in);
    redirect("/");
  }

  // Pas de session immédiate : le projet Supabase exige une confirmation
  // par email avant la première connexion.
  redirect("/inscription?etape=verification");
}

export async function deconnexionAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  redirect("/");
}
