"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@fidwastafid/auth";
import { getAuthClient, updateUserPassword } from "./supabaseAuthClient.js";
import { setSessionCookie } from "./sessionCookie.js";
import { SITE_URL } from "./siteUrl.js";
import { safeNextPath } from "./nextPath.js";
import { getClientIp, isRateLimitedByEmail } from "../app/api/v1/_lib/rateLimit.js";
import { verifyTurnstile } from "../app/api/v1/_lib/turnstile.js";

export async function connexionAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  const { data, error } = await getAuthClient().auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    redirect(`/connexion?erreur=1&next=${encodeURIComponent(next)}`);
  }

  await setSessionCookie(data.session.access_token, data.session.expires_in);
  redirect(next);
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
  const next = safeNextPath(formData.get("next"));

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
    redirect(`/inscription?erreur=1&next=${encodeURIComponent(next)}`);
  }

  if (data.session) {
    await setSessionCookie(data.session.access_token, data.session.expires_in);
    redirect(next);
  }

  // Pas de session immédiate : le projet Supabase exige une confirmation
  // par email avant la première connexion. `next` n'est pas propagé au-delà
  // de ce point (emailRedirectTo pointe sur /auth/confirm, sans le relayer)
  // — limite connue, hors périmètre de cette action.
  redirect("/inscription?etape=verification");
}

export async function deconnexionAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  redirect("/");
}

/**
 * Demande de réinitialisation — même protection anti-robot que /soumettre
 * (cette route déclenche un envoi d'email, donc un coût réel par requête,
 * contrairement à connexion/inscription). Réponse TOUJOURS identique que
 * l'email existe ou non : jamais de branchement observable côté client sur
 * le résultat de `resetPasswordForEmail` (l'API Supabase elle-même ne
 * révèle rien — c'est nous qui devons rester silencieux tout du long).
 */
export async function motDePasseOublieAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const turnstileToken = formData.get("cf-turnstile-response");

  const request = new Request("http://localhost/", { headers: await headers() });
  const ip = getClientIp(request);

  const turnstileOk = await verifyTurnstile(turnstileToken ? String(turnstileToken) : null, ip);
  if (!turnstileOk) {
    redirect("/mot-de-passe-oublie?erreur=turnstile");
  }

  if (email) {
    if (await isRateLimitedByEmail("reinitialisation", request, email)) {
      redirect("/mot-de-passe-oublie?erreur=limite");
    }

    await getAuthClient().auth.resetPasswordForEmail(email, {
      redirectTo: new URL("/reinitialiser-mot-de-passe", SITE_URL).toString(),
    });
  }

  redirect("/mot-de-passe-oublie?etape=envoye");
}

/**
 * Pose le nouveau mot de passe — appelée depuis le formulaire de
 * /reinitialiser-mot-de-passe, qui n'est jamais atteint sans une session de
 * récupération valide déjà posée en cookie (verifyOtp côté page, cf.
 * app/reinitialiser-mot-de-passe/page.tsx). Pas de re-vérification du
 * token ici : le cookie de session EST la preuve que le lien a déjà été
 * validé une fois — updateUserPassword échoue proprement si la session a
 * entre-temps expiré.
 */
export async function reinitialiserMotDePasseAction(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("passwordConfirmation") ?? "");

  if (password !== confirmation) {
    redirect("/reinitialiser-mot-de-passe?erreur=confirmation");
  }

  const store = await cookies();
  const accessToken = store.get(SESSION_COOKIE_NAME)?.value;
  if (!accessToken) {
    redirect("/mot-de-passe-oublie");
  }

  const ok = await updateUserPassword(accessToken, password);
  if (!ok) {
    redirect("/reinitialiser-mot-de-passe?erreur=echec");
  }

  redirect("/?motdepasse=reinitialise");
}
