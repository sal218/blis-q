import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY!);

// Placeholder Resend sender. BLOCKING before launch: switch to a verified
// custom domain (CLAUDE.md "Development Philosophy"). Until the domain is
// verified, onboarding@resend.dev only delivers to the Resend account owner.
const FROM_ADDRESS = "Blis-Q <onboarding@resend.dev>";

// Brand: deep indigo / violet (Blis-Q identity — NOT the Even Tab green).
const BRAND_PRIMARY = "#4F46E5";

// All copy below is PLACEHOLDER Polish — coherent but pending final wording
// from the client. User-facing strings are Polish (Blis-Q's primary market).

/**
 * Shared responsive email shell. Keeps every template visually consistent and
 * avoids repeating the full HTML boilerplate in each send function.
 */
function renderEmail(options: {
  heading: string;
  bodyHtml: string;
}): string {
  const year = new Date().getFullYear();
  return `
    <!DOCTYPE html>
    <html lang="pl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Blis-Q</title>
    </head>
    <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f5f5f5;">
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        <tr>
          <td align="center" style="padding:40px 20px;">
            <table role="presentation" style="width:100%;max-width:480px;background:#ffffff;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
              <tr>
                <td style="padding:40px 32px;text-align:center;">
                  <h1 style="margin:0 0 32px;font-size:28px;font-weight:800;color:${BRAND_PRIMARY};">Blis-Q</h1>
                  <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#111827;">${options.heading}</h2>
                  ${options.bodyHtml}
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">
              &copy; ${year} Blis-Q
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:14px 32px;background:${BRAND_PRIMARY};color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:16px;">${label}</a>`;
}

/**
 * Send an email via Resend. Throws on failure so callers (route handlers) can
 * surface the error. Never logs the recipient address or email body.
 */
async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  if (error) {
    // Log only Resend's stable error name (e.g. "rate_limit_exceeded") — never
    // the raw error object, which can carry the recipient or request internals.
    console.error("[email] send failed", { code: error.name });
    throw new Error("Failed to send email");
  }
}

/** Welcome email sent after a user completes registration. */
export async function sendWelcomeEmail(email: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Witaj w Blis-Q 🌈",
    html: renderEmail({
      heading: "Witaj w Blis-Q",
      bodyHtml: `
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4B5563;">
          Dziękujemy za dołączenie do Blis-Q — bezpiecznej przestrzeni dla
          społeczności LGBT+ w Polsce. Twoje konto jest już aktywne.
        </p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#9CA3AF;">
          Pamiętaj, że możesz w każdej chwili dostosować ustawienia prywatności
          i powiadomień w aplikacji.
        </p>
      `,
    }),
  });
}

/** Password reset email with a secure, time-limited link. */
export async function sendPasswordResetEmail(
  email: string,
  resetLink: string,
): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Zresetuj hasło do Blis-Q",
    html: renderEmail({
      heading: "Reset hasła",
      bodyHtml: `
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4B5563;">
          Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta. Kliknij
          poniższy przycisk, aby ustawić nowe hasło.
        </p>
        ${ctaButton(resetLink, "Zresetuj hasło")}
        <p style="margin:24px 0 0;font-size:13px;color:#9CA3AF;">
          Link wygasa po 30 minutach.
        </p>
        <hr style="margin:32px 0;border:none;border-top:1px solid #E5E7EB;">
        <p style="margin:0;font-size:12px;line-height:1.5;color:#9CA3AF;">
          Jeśli to nie Ty prosiłeś(aś) o reset hasła, zignoruj tę wiadomość —
          Twoje hasło pozostanie bez zmian.
        </p>
      `,
    }),
  });
}

/** Invitation to join a community. */
export async function sendCommunityInviteEmail(
  email: string,
  inviteLink: string,
  communityName?: string,
): Promise<void> {
  const community = communityName ?? "społeczności";
  await sendEmail({
    to: email,
    subject: "Zaproszenie do społeczności na Blis-Q",
    html: renderEmail({
      heading: "Masz zaproszenie",
      bodyHtml: `
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4B5563;">
          Zostałeś(aś) zaproszony(a) do dołączenia do ${community} na Blis-Q.
        </p>
        ${ctaButton(inviteLink, "Dołącz do społeczności")}
        <p style="margin:24px 0 0;font-size:13px;color:#9CA3AF;">
          To zaproszenie wygasa po 7 dniach.
        </p>
      `,
    }),
  });
}

/** Confirmation that an account has been deleted / anonymised (GDPR erasure). */
export async function sendAccountDeletionEmail(email: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Twoje konto Blis-Q zostało usunięte",
    html: renderEmail({
      heading: "Konto usunięte",
      bodyHtml: `
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4B5563;">
          Potwierdzamy, że Twoje konto Blis-Q zostało usunięte, a Twoje dane
          osobowe zostały zanonimizowane zgodnie z RODO.
        </p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#9CA3AF;">
          Jeśli nie zlecałeś(aś) usunięcia konta, skontaktuj się z nami
          niezwłocznie.
        </p>
      `,
    }),
  });
}
