import "server-only";

import { env } from "./env";
import { isEmailConfigured, serverEnv } from "./server-env";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Sends a transactional email through Resend (https://resend.com). */
export async function sendEmail(message: EmailMessage): Promise<{ sent: boolean }> {
  if (!isEmailConfigured()) {
    console.info(`[email] skipped (RESEND_API_KEY / EMAIL_FROM not set) → ${message.to}: ${message.subject}`);
    return { sent: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${serverEnv.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: serverEnv.emailFrom,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!res.ok) {
      console.error("[email] Resend error", res.status, await res.text());
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] network error", err);
    return { sent: false };
  }
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Minimal, client-safe HTML email shell in the brand style. */
export function emailLayout({ preheader, heading, body, cta }: {
  preheader: string;
  heading: string;
  body: string;
  cta?: { label: string; href: string };
}) {
  const name = escapeHtml(env.siteName);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#050507;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#f6f6f9;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050507;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0d0d11;border:1px solid #1d1d25;border-radius:20px;overflow:hidden;">
<tr><td style="padding:28px 32px;border-bottom:1px solid #1d1d25;font-weight:800;letter-spacing:4px;font-size:14px;">${name}</td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;letter-spacing:-0.5px;">${escapeHtml(heading)}</h1>
<div style="font-size:15px;line-height:1.65;color:#b9b9c6;">${body}</div>
${cta ? `<div style="margin-top:28px;"><a href="${cta.href}" style="display:inline-block;background:#ffffff;color:#050507;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:999px;font-size:14px;">${escapeHtml(cta.label)}</a></div>` : ""}
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #1d1d25;font-size:12px;color:#5e5e6e;">You are receiving this email because of activity on your ${name} account.</td></tr>
</table></td></tr></table></body></html>`;
}
