/**
 * How a card payment landed in the platform's Stripe balance. When the
 * platform doesn't hold the currency the buyer paid in (e.g. USD into a
 * PLN account), Stripe converts it, and transfers linked to that payment
 * must be made in the converted currency.
 */
export interface Settlement {
  /** What the buyer paid, in the order's currency (minor units). */
  chargeAmount: number;
  chargeCurrency: string;
  /** The same payment as it arrived in the platform balance, before fees. */
  settledAmount: number;
  settledCurrency: string;
}

/**
 * A producer's share of a payment, in the currency to transfer it in.
 * Converted shares are rounded down so the transfers never exceed the payment.
 */
export function shareOfPayment(net: number, currency: string, settlement: Settlement | null): { amount: number; currency: string } {
  if (
    !settlement ||
    settlement.settledCurrency === currency ||
    settlement.chargeCurrency !== currency ||
    settlement.chargeAmount <= 0 ||
    settlement.settledAmount <= 0
  ) {
    return { amount: net, currency };
  }
  return {
    amount: Math.floor((net * settlement.settledAmount) / settlement.chargeAmount),
    currency: settlement.settledCurrency,
  };
}
