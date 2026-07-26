/**
 * INRT WALLET — payments/config.ts
 *
 * Single source of truth for which payment mode the app runs in.
 *
 * VITE_PAYMENT_MODE = 'sandbox' | 'live'
 *   - 'sandbox' (default): all payments run through the simulator.
 *     No real bank, card network, or UPI switch is ever contacted.
 *   - 'live': payments run through whatever real PA integration has
 *     been written in LivePaymentSheet.tsx. IMPORTANT: setting this
 *     does NOT make real payments work by itself — it only tells the
 *     app to use the "live" code path. That code path still needs a
 *     real, working integration against an actual RBI-authorized
 *     Payment Aggregator's API (Razorpay/Cashfree/Setu/etc.) written
 *     into LivePaymentSheet.tsx before this flag means anything.
 *     Flipping this before that integration exists will show a clear
 *     "not configured" error instead of silently pretending to work.
 */
export type PaymentMode = 'sandbox' | 'live';

export const PAYMENT_MODE: PaymentMode =
  (import.meta.env.VITE_PAYMENT_MODE as PaymentMode) === 'live' ? 'live' : 'sandbox';

export const IS_SANDBOX = PAYMENT_MODE === 'sandbox';
export const IS_LIVE    = PAYMENT_MODE === 'live';
