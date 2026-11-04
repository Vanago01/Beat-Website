"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { payoutSeller, refundOrder } from "@/actions/admin";

export function RefundButton({ orderId, label }: { orderId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button size="xs" variant="danger" onClick={() => setOpen(true)}>
        <RotateCcw className="h-3 w-3" /> Refund
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Refund this order?"
        description={label}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await refundOrder(orderId);
                  setOpen(false);
                  if (!res.ok) return void toast.error("Refund failed", { description: res.error });
                  toast.success("Order refunded", { description: "The buyer's download access was revoked and seller transfers reversed." });
                  router.refresh();
                })
              }
            >
              Refund in full
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-300">The buyer is refunded through Stripe, their licenses are revoked, and any seller transfers for this order are reversed. This cannot be undone.</p>
      </Modal>
    </>
  );
}

export function PayoutButton({ sellerId, disabled }: { sellerId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="xs"
      disabled={disabled}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await payoutSeller(sellerId);
          if (!res.ok) return void toast.error("Payout failed", { description: res.error });
          toast.success(res.data.message);
          router.refresh();
        })
      }
    >
      <Send className="h-3 w-3" /> Pay out
    </Button>
  );
}
