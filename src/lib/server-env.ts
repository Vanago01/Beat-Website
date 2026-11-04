import "server-only";

// Secrets — only ever read on the server.
export const serverEnv = {
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  /** Optional: signing secret of a separate endpoint for Connect (connected-account) events. */
  stripeConnectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  stripeConnectCountry: process.env.STRIPE_CONNECT_DEFAULT_COUNTRY ?? "PL",
};

export const isStripeConfigured = () => Boolean(serverEnv.stripeSecretKey);
export const isEmailConfigured = () => Boolean(serverEnv.resendApiKey && serverEnv.emailFrom);
