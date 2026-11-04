import "server-only";

// Secrets — only ever read on the server. Values are trimmed so a pasted
// space or line break doesn't make a key invalid.
const read = (...names: string[]) => names.map((n) => process.env[n]?.trim()).find(Boolean) ?? "";

export const serverEnv = {
  supabaseSecretKey: read("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
  stripeSecretKey: read("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: read("STRIPE_WEBHOOK_SECRET"),
  /** Optional: signing secret of a separate endpoint for Connect (connected-account) events. */
  stripeConnectWebhookSecret: read("STRIPE_CONNECT_WEBHOOK_SECRET"),
  resendApiKey: read("RESEND_API_KEY"),
  emailFrom: read("EMAIL_FROM"),
  stripeConnectCountry: read("STRIPE_CONNECT_DEFAULT_COUNTRY") || "PL",
};

export const isStripeConfigured = () => Boolean(serverEnv.stripeSecretKey);
export const isEmailConfigured = () => Boolean(serverEnv.resendApiKey && serverEnv.emailFrom);
