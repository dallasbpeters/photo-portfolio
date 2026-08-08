import { getSite } from "./site.js";

/** Thrown when RESEND_API_KEY is absent, so handlers can answer 503 rather than 500. */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email is not configured");
    this.name = "EmailNotConfiguredError";
  }
}

export interface SendEmailInput {
  html: string;
  subject: string;
  text: string;
  to: string;
}

/**
 * Sends one transactional email through Resend.
 *
 * Uses fetch against the REST API rather than the `resend` SDK — this runs in a
 * Vercel function where the only thing needed is a single POST, and it keeps the
 * dependency out of the bundle.
 */
export const sendEmail = async ({
  to,
  subject,
  html,
  text,
}: SendEmailInput): Promise<void> => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new EmailNotConfiguredError();
  }

  const res = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: getSite().emailFrom,
      html,
      subject,
      text,
      to: [to],
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend responded ${res.status}: ${detail.slice(0, 300)}`);
  }
};

/** Plain-text and HTML bodies for the reset email. */
export const passwordResetEmail = (
  resetUrl: string,
  expiresMinutes: number
) => {
  const site = getSite();
  const subject = `Reset your ${site.name} password`;

  const text = [
    `Reset your ${site.name} password`,
    "",
    `Open this link to choose a new password. It expires in ${expiresMinutes} minutes and can only be used once.`,
    "",
    resetUrl,
    "",
    "If you didn't request this, you can ignore this email — your password will not change.",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0a0a0a;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:40px;">
            <tr>
              <td>
                <h1 style="margin:0 0 24px;color:#fff;font-size:14px;font-weight:300;letter-spacing:0.3em;text-transform:uppercase;">
                  ${escapeHtml(site.name)}
                </h1>
                <p style="margin:0 0 24px;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;">
                  Choose a new password using the button below. This link expires in
                  ${expiresMinutes} minutes and can only be used once.
                </p>
                <a href="${escapeHtml(resetUrl)}"
                   style="display:inline-block;background:#fff;color:#000;text-decoration:none;padding:14px 28px;border-radius:4px;font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;">
                  Reset password
                </a>
                <p style="margin:32px 0 0;color:rgba(255,255,255,0.35);font-size:12px;line-height:1.6;">
                  If you didn't request this, ignore this email — your password will not change.
                </p>
                <p style="margin:24px 0 0;color:rgba(255,255,255,0.25);font-size:11px;word-break:break-all;">
                  ${escapeHtml(resetUrl)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, subject, text };
};

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "'": "&#39;", '"': "&quot;", "&": "&amp;", "<": "&lt;", ">": "&gt;" })[
        c
      ] as string
  );
