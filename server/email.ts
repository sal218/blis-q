import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY!);

/**
 * Send a password reset email with a secure, time-limited reset link.
 * The link opens a mobile-friendly web page where users can set a new password.
 */
export async function sendPasswordResetEmail(
  email: string,
  resetLink: string,
): Promise<void> {
  const result = await resend.emails.send({
    from: "Even Tab <noreply@eventab.app>",
    to: email,
    subject: "Reset your Even Tab password",
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f5f5f5;">
        <table role="presentation" style="width:100%;border-collapse:collapse;">
          <tr>
            <td align="center" style="padding:40px 20px;">
              <table role="presentation" style="width:100%;max-width:480px;background:#ffffff;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="padding:40px 32px;text-align:center;">
                    <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#10B981;">Even Tab</h1>
                    <p style="margin:0 0 32px;font-size:14px;color:#6B7280;">Split. Track. Grow.</p>

                    <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#111827;">Reset Your Password</h2>
                    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4B5563;">
                      We received a request to reset your password. Click the button below to create a new password.
                    </p>

                    <a href="${resetLink}"
                       style="display:inline-block;padding:14px 32px;background:#10B981;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:16px;">
                      Reset Password
                    </a>

                    <p style="margin:24px 0 0;font-size:13px;color:#9CA3AF;">
                      This link expires in 30 minutes for your security.
                    </p>

                    <hr style="margin:32px 0;border:none;border-top:1px solid #E5E7EB;">
                    <p style="margin:0;font-size:12px;line-height:1.5;color:#9CA3AF;">
                      If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">
                &copy; ${new Date().getFullYear()} Even Tab. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  });

  if ((result as any)?.error) {
    console.error("Resend password reset email error:", (result as any).error);
    throw new Error(
      (result as any).error.message || "Failed to send password reset email",
    );
  }
}

export async function sendSignupConfirmationEmail(
  email: string,
  confirmLink: string,
): Promise<void> {
  const result = await resend.emails.send({
    from: "Even Tab <noreply@eventab.app>",
    to: email,
    subject: "Confirm your Even Tab account",
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirm Your Account</title>
      </head>
      <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f5f5f5;">
        <table role="presentation" style="width:100%;border-collapse:collapse;">
          <tr>
            <td align="center" style="padding:40px 20px;">
              <table role="presentation" style="width:100%;max-width:480px;background:#ffffff;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="padding:40px 32px;text-align:center;">
                    <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#10B981;">Even Tab</h1>
                    <p style="margin:0 0 32px;font-size:14px;color:#6B7280;">Split. Track. Grow.</p>

                    <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#111827;">Confirm your account</h2>
                    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4B5563;">
                      Thanks for signing up! Click the button below to verify your email address and activate your account.
                    </p>

                    <a href="${confirmLink}"
                       style="display:inline-block;padding:14px 32px;background:#10B981;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:16px;">
                      Confirm Email
                    </a>

                    <p style="margin:24px 0 0;font-size:13px;color:#9CA3AF;">
                      This link expires in 24 hours.
                    </p>

                    <hr style="margin:32px 0;border:none;border-top:1px solid #E5E7EB;">
                    <p style="margin:0;font-size:12px;line-height:1.5;color:#9CA3AF;">
                      If you didn't create an Even Tab account, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">
                &copy; ${new Date().getFullYear()} Even Tab. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  });

  if ((result as any)?.error) {
    console.error("Resend confirmation email error:", (result as any).error);
    throw new Error(
      (result as any).error.message || "Failed to send confirmation email",
    );
  }
}

export async function sendPasswordChangedEmail(email: string): Promise<void> {
  const result = await resend.emails.send({
    from: "Even Tab <noreply@eventab.app>",
    to: email,
    subject: "Your Even Tab password was changed",
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Changed</title>
      </head>
      <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f5f5f5;">
        <table role="presentation" style="width:100%;border-collapse:collapse;">
          <tr>
            <td align="center" style="padding:40px 20px;">
              <table role="presentation" style="width:100%;max-width:480px;background:#ffffff;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="padding:40px 32px;text-align:center;">
                    <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#10B981;">Even Tab</h1>
                    <p style="margin:0 0 32px;font-size:14px;color:#6B7280;">Split. Track. Grow.</p>

                    <div style="width:64px;height:64px;border-radius:50%;background:#FEF3C7;display:inline-flex;align-items:center;justify-content:center;margin-bottom:24px;">
                      <span style="font-size:28px;">🔐</span>
                    </div>

                    <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#111827;">Password Changed</h2>
                    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4B5563;">
                      Your Even Tab password was successfully changed. If you made this change, no further action is needed.
                    </p>

                    <div style="background:#FEF2F2;border-radius:10px;padding:16px 20px;margin-bottom:24px;text-align:left;">
                      <p style="margin:0;font-size:14px;color:#DC2626;font-weight:600;">Wasn't you?</p>
                      <p style="margin:8px 0 0;font-size:14px;color:#4B5563;line-height:1.5;">
                        Contact us immediately at
                        <a href="mailto:support@eventab.app" style="color:#10B981;font-weight:600;">support@eventab.app</a>
                        so we can secure your account.
                      </p>
                    </div>

                    <hr style="margin:0 0 24px;border:none;border-top:1px solid #E5E7EB;">
                    <p style="margin:0;font-size:12px;line-height:1.5;color:#9CA3AF;">
                      This is an automated security notification from Even Tab.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">
                &copy; ${new Date().getFullYear()} Even Tab. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  });

  if ((result as any)?.error) {
    console.error(
      "Resend password changed email error:",
      (result as any).error,
    );
  }
}

export async function sendInviteEmail(email: string, inviteLink: string) {
  const result = await resend.emails.send({
    from: "Even Tab <noreply@eventab.app>",
    to: email,
    subject: "You've been invited to Even Tab",
    html: `
      <h2>You've been invited to Even Tab 🎉</h2>
      <p>Split expenses easily with your friends.</p>
      <p>Click below to join:</p>
      <a href="${inviteLink}" style="padding:12px 20px;background:#000;color:#fff;border-radius:8px;text-decoration:none;">
        Join Even Tab
      </a>
      <p>This invite expires in 7 days.</p>
    `,
  });

  if ((result as any)?.error) {
    console.error("Resend send error:", (result as any).error);
    throw new Error(
      (result as any).error.message || "Resend failed to send email",
    );
  }

  return result;
}
