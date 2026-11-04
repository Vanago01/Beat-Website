import { NextResponse, type NextRequest } from "next/server";
import { getOwnedPurchase } from "@/lib/purchase-access";
import { buildLicensePdf } from "@/lib/license-pdf";
import type { LicenseSnapshot } from "@/lib/types";

/** Generates the license agreement PDF for a purchase the visitor owns. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/license/[purchaseId]">) {
  const { purchaseId } = await ctx.params;
  const access = await getOwnedPurchase(purchaseId);
  if (access.status === 401) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/account/library")}`, request.url));
  }
  if (access.status !== 200) {
    return NextResponse.json({ error: access.status === 403 ? "This license was refunded." : "Not found" }, { status: access.status });
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
