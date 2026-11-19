import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "./server-env";

/**
 * Links to a license PDF carry a pass that works for a day. They open in a
 * new window, which on phones and tablets isn't always signed in to the same
 * account (a site added to the Home Screen runs separately from Safari), so
 * the pass, not the session, proves the link came from the buyer's library.
 */
const LIFETIME_SECONDS = 24 * 60 * 60;

function keyMaterial() {
  return createHmac("sha256", serverEnv.supabaseSecretKey).update("vbeats:license-link:v1").digest();
}

function signature(purchaseId: string, expires: number) {
  return createHmac("sha256", keyMaterial()).update(`${purchaseId.toLowerCase()}.${expires}`).digest("base64url");
}

/** The address of a purchase's license PDF, with a pass when the server can sign one. */
export function licenseHref(purchaseId: string) {
  if (!serverEnv.supabaseSecretKey) return `/api/license/${purchaseId}`;
  const expires = Math.floor(Date.now() / 1000) + LIFETIME_SECONDS;
  return `/api/license/${purchaseId}?exp=${expires}&sig=${signature(purchaseId, expires)}`;
}

/** True for a pass made by licenseHref for this purchase that hasn't expired. */
export function isValidLicensePass(purchaseId: string, exp: string | null, sig: string | null) {
  if (!serverEnv.supabaseSecretKey || !exp || !sig || !/^\d{1,12}$/.test(exp) || sig.length > 100) return false;
  const expires = Number(exp);
  const now = Math.floor(Date.now() / 1000);
  if (expires < now || expires > now + LIFETIME_SECONDS + 300) return false;
  const expected = Buffer.from(signature(purchaseId, expires));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
