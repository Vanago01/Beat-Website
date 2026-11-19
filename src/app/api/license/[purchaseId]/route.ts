import { NextResponse, type NextRequest } from "next/server";
import { getOwnedPurchase, getPurchaseForPass } from "@/lib/purchase-access";
import { isValidLicensePass } from "@/lib/license-links";
import { buildLicensePdf } from "@/lib/license-pdf";
import type { LicenseSnapshot } from "@/lib/types";

/**
 * Generates the license agreement PDF of a purchase: for a link from the
 * buyer's library (it carries a pass) or for the signed-in buyer.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/license/[purchaseId]">) {
  const { purchaseId } = await ctx.params;
  const sp = request.nextUrl.searchParams;
  const access = isValidLicensePass(purchaseId, sp.get("exp"), sp.get("sig"))
    ? await getPurchaseForPass(purchaseId)
    : await getOwnedPurchase(purchaseId);
  if (access.status === 401) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/account/library")}`, request.url));
  }
  if (access.status !== 200) {
    // Back to the library, which explains what happened.
    const notice = access.status === 403 ? "refunded" : "missing";
    return NextResponse.redirect(new URL(`/account/library?notice=${notice}`, request.url));
  }
  const { purchase, buyer } = access;
  const snapshot = purchase.license_snapshot as unknown as LicenseSnapshot;

  const pdf = await buildLicensePdf({
    licenseNumber: purchase.license_number,
    purchasedAt: snapshot.purchased_at ?? purchase.created_at,
    snapshot,
    buyerName: buyer.name,
    buyerEmail: buyer.email,
    orderNumber: snapshot.order_number ?? null,
  });

  const filename = `${purchase.license_number} - ${snapshot.beat_title}`.replace(/[\\/:*?"<>|]+/g, "").slice(0, 120);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename.replace(/[^\x20-\x7e]/g, "_")}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`,
      "Cache-Control": "private, no-store",
    },
  });
}
