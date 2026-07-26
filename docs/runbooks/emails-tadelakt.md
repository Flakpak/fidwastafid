# Runbook — e-mails transactionnels en charte Tadelakt

*Créé le 26/07/2026 (refonte Tadelakt, lot 3). **Action de configuration externe** : ces
gabarits ne vivent pas dans le dépôt, ils se collent dans le dashboard Supabase. Rien
n'est appliqué automatiquement par un déploiement.*

---

## 0 — Ce que couvre ce runbook

**Inventaire réalisé au lot 3** (`grep` sur `resend`, `@react-email`, `nodemailer`,
`sendgrid`, `postmark`, `mailgun`, `noreply@`, gabarits `*.html`) :

| Emplacement | Constat |
|---|---|
| Dépôt (`apps/`, `packages/`) | **Aucun** gabarit, aucune dépendance d'envoi, aucun appel Resend. Rien à migrer côté code. |
| Dashboard Supabase | **2 gabarits actifs** — confirmation d'inscription et réinitialisation de mot de passe. Objet de ce runbook. |

Les deux seuls e-mails que l'application déclenche :

- `signUp({ emailRedirectTo: <site>/auth/confirm })` — `apps/web/src/lib/authActions.ts`
- `resetPasswordForEmail(email, { redirectTo: <site>/reinitialiser-mot-de-passe })` — idem

## 1 — ⚠️ Contrainte technique à ne PAS casser

Ces gabarits **ne peuvent pas utiliser `{{ .ConfirmationURL }}`**, le lien par défaut de
Supabase.

L'application vérifie les liens d'e-mail avec **`token_hash` + `verifyOtp()`**, jamais
`code` + `exchangeCodeForSession()` — le client n'a jamais fixé `flowType`, qui vaut
`implicit` par défaut, et le flow PKCE ne peut de toute façon pas fonctionner pour un lien
ouvert depuis un autre appareil (le `code_verifier` reste sur l'appareil d'origine). Voir
l'en-tête de `apps/web/src/app/auth/confirm/route.ts`.

Les URL doivent donc être **construites à la main** :

| Gabarit | URL à utiliser |
|---|---|
| Confirmation d'inscription | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` |
| Réinitialisation | `{{ .SiteURL }}/auth/reset?token_hash={{ .TokenHash }}&type=recovery` |

> Coller un gabarit par défaut contenant `{{ .ConfirmationURL }}` **casse l'inscription et
> la réinitialisation en production** (l'utilisateur atterrit sur
> `/connexion?erreur=confirmation`). C'est la seule erreur vraiment coûteuse de ce runbook.

## 2 — Jeton de couleurs (valeurs en dur, contexte e-mail)

Un e-mail n'a ni variables CSS ni feuille de style externe : tout est **en ligne**, en
hexadécimal littéral. Correspondance avec les tokens Tadelakt (`CONTRAT-V1 §8`) :

| Hex | Token | Emploi dans l'e-mail |
|---|---|---|
| `#F4F1EC` | `surface-base` | fond de l'e-mail (plâtre) |
| `#FFFFFF` | `surface` | panneau central |
| `#E3DED4` | `border` | filets |
| `#1A1815` | `ink` | titres, texte principal, **fond du bouton** |
| `#5C554B` | `ink-muted` | texte secondaire |
| `#736B61` | `ink-subtle` | mentions légales, pied |
| `#2C5545` | `accent` | liens, filet de marque |

Règles conservées : **une seule action pleine** par e-mail (le bouton `ink`) ; aucun
dégradé ; ni rouge ni or. Pas de police web — Scheherazade New ne se charge pas dans un
client mail, l'arabe retombe sur `Georgia, 'Times New Roman', serif`, ce qui reste
acceptable pour un simple wordmark.

## 3 — Gabarit : confirmation d'inscription

**Dashboard Supabase → Authentication → Emails → « Confirm signup ».**

*Objet :* `Confirme ton inscription — Fidwastafid`

```html
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F1EC;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#FFFFFF;border:1px solid #E3DED4;border-radius:11px;padding:32px;">
        <!-- Sceau (wordmark en encre — pas de police web en e-mail) -->
        <tr>
          <td align="center" dir="rtl" style="font-family:Georgia,'Times New Roman',serif;font-size:26px;color:#1A1815;padding-bottom:6px;">
            فيد و ستافيد
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-bottom:22px;">
            <div style="width:96px;height:2px;background-color:#2C5545;line-height:2px;font-size:0;">&nbsp;</div>
          </td>
        </tr>

        <tr>
          <td style="font-size:19px;font-weight:600;color:#1A1815;padding-bottom:10px;">
            Bienvenue sur Fidwastafid
          </td>
        </tr>
        <tr>
          <td style="font-size:14.5px;line-height:1.6;color:#5C554B;padding-bottom:24px;">
            Confirme ton adresse e-mail pour activer ton compte et commencer à partager
            tes bons plans avec la communauté.
          </td>
        </tr>

        <!-- Action pleine unique -->
        <tr>
          <td align="center" style="padding-bottom:24px;">
            <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=signup"
               style="display:inline-block;background-color:#1A1815;color:#F4F1EC;text-decoration:none;font-size:14.5px;font-weight:500;padding:13px 26px;border-radius:9px;">
              Confirmer mon adresse
            </a>
          </td>
        </tr>

        <tr>
          <td style="font-size:12px;line-height:1.6;color:#736B61;border-top:1px solid #E3DED4;padding-top:18px;">
            Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br>
            <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=signup"
               style="color:#2C5545;word-break:break-all;">{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=signup</a>
          </td>
        </tr>
        <tr>
          <td style="font-size:11.5px;line-height:1.6;color:#736B61;padding-top:14px;">
            Tu n'es pas à l'origine de cette inscription ? Ignore cet e-mail, aucun compte
            ne sera activé.
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;padding-top:16px;">
        <tr>
          <td align="center" style="font-size:11px;color:#736B61;">
            Fidwastafid — Les bons plans du Maroc · Traitement déclaré auprès de la CNDP (loi 09-08)
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

## 4 — Gabarit : réinitialisation de mot de passe

**Dashboard Supabase → Authentication → Emails → « Reset password ».**

*Objet :* `Réinitialise ton mot de passe — Fidwastafid`

```html
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F1EC;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#FFFFFF;border:1px solid #E3DED4;border-radius:11px;padding:32px;">
        <tr>
          <td align="center" dir="rtl" style="font-family:Georgia,'Times New Roman',serif;font-size:26px;color:#1A1815;padding-bottom:6px;">
            فيد و ستافيد
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-bottom:22px;">
            <div style="width:96px;height:2px;background-color:#2C5545;line-height:2px;font-size:0;">&nbsp;</div>
          </td>
        </tr>

        <tr>
          <td style="font-size:19px;font-weight:600;color:#1A1815;padding-bottom:10px;">
            Réinitialiser ton mot de passe
          </td>
        </tr>
        <tr>
          <td style="font-size:14.5px;line-height:1.6;color:#5C554B;padding-bottom:24px;">
            Clique ci-dessous pour choisir un nouveau mot de passe. Ce lien n'est utilisable
            qu'une seule fois et expire après un court délai.
          </td>
        </tr>

        <tr>
          <td align="center" style="padding-bottom:24px;">
            <a href="{{ .SiteURL }}/auth/reset?token_hash={{ .TokenHash }}&amp;type=recovery"
               style="display:inline-block;background-color:#1A1815;color:#F4F1EC;text-decoration:none;font-size:14.5px;font-weight:500;padding:13px 26px;border-radius:9px;">
              Choisir un nouveau mot de passe
            </a>
          </td>
        </tr>

        <tr>
          <td style="font-size:12px;line-height:1.6;color:#736B61;border-top:1px solid #E3DED4;padding-top:18px;">
            Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br>
            <a href="{{ .SiteURL }}/auth/reset?token_hash={{ .TokenHash }}&amp;type=recovery"
               style="color:#2C5545;word-break:break-all;">{{ .SiteURL }}/auth/reset?token_hash={{ .TokenHash }}&amp;type=recovery</a>
          </td>
        </tr>
        <tr>
          <td style="font-size:11.5px;line-height:1.6;color:#736B61;padding-top:14px;">
            Tu n'as pas demandé cette réinitialisation ? Ignore cet e-mail — ton mot de
            passe actuel reste inchangé.
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;padding-top:16px;">
        <tr>
          <td align="center" style="font-size:11px;color:#736B61;">
            Fidwastafid — Les bons plans du Maroc · Traitement déclaré auprès de la CNDP (loi 09-08)
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

## 5 — Vérification après application (à faire manuellement)

1. **Inscription** : créer un compte jetable → l'e-mail arrive en charte Tadelakt → le
   bouton redirige vers `/` **connecté** (et non `/connexion?erreur=confirmation`).
2. **Réinitialisation** : demander un lien depuis `/mot-de-passe-oublie` → le bouton mène
   au formulaire de nouveau mot de passe, pas à une page d'erreur.
3. Vérifier le rendu sur au moins **Gmail web + un client mobile** (les `border-radius` et
   `max-width` sont ignorés par certaines versions d'Outlook — dégradation acceptée, le
   contenu reste lisible et le bouton cliquable).
4. Si l'étape 1 ou 2 échoue sur `erreur=confirmation`, la cause est **quasi certainement**
   un `{{ .ConfirmationURL }}` resté dans le gabarit — voir §1.
