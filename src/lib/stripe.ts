import "server-only";

import Stripe from "stripe";
import { env } from "./env";
import { serverEnv } from "./server-env";

let stripe: Stripe | null = null;

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super("Payments are not configured yet. Add STRIPE_SECRET_KEY to the server environment.");
  }
}

export function getStripe(): Stripe {
  if (!serverEnv.stripeSecretKey) throw new PaymentsNotConfiguredError();
  if (!stripe) {
    stripe = new Stripe(serverEnv.stripeSecretKey, {
      appInfo: { name: `${env.siteName} Marketplace` },
      maxNetworkRetries: 2,
      typescript: true,
    });
  }
  return stripe;
}
