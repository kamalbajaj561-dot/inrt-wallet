/**
 * INRT WALLET — LivePaymentSheet.tsx
 *
 * This is where a REAL Payment Aggregator integration goes once you
 * have one: RBI PA authorization in hand, a signed agreement with a
 * PA (Razorpay/Cashfree/Setu/etc.), and real API keys.
 *
 * Until that integration is written, this component intentionally
 * does NOT fall back to the sandbox simulator and does NOT pretend
 * to succeed. It shows a clear "not configured" message. This is
 * deliberate: silently falling back to fake success here would mean
 * real users could believe a real payment went through when nothing
 * happened — that's the one failure mode this file must never allow.
 *
 * TO GO LIVE:
 *   1. Get RBI Payment Aggregator authorization (or a partnership
 *      with an already-authorized PA).
 *   2. Get real API keys from that PA.
 *   3. Replace the body of this component with actual calls to that
 *      PA's checkout SDK (e.g. Razorpay's `window.Razorpay` checkout,
 *      as already partially scaffolded in CheckoutPage.tsx).
 *   4. Set VITE_PAYMENT_MODE=live in your environment.
 */
import type { PaymentSheetProps } from '../lib/payments/types';

export default function LivePaymentSheet({ amount, itemLabel, onCancel }: PaymentSheetProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        maxWidth: 420, width: '100%', background: '#0D2A4A',
        border: '1px solid rgba(255,59,48,0.4)', borderRadius: 20,
        padding: 28, textAlign: 'center', color: '#fff',
        fontFamily: "'Plus Jakarta Sans',sans-serif",
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <p style={{ fontSize: 16, fontWeight: 800, margin: '0 0 8px' }}>
          Live payments not configured
        </p>
        <p style={{ fontSize: 13, color: '#8B9DB3', margin: '0 0 4px', lineHeight: 1.5 }}>
          VITE_PAYMENT_MODE is set to "live", but no real Payment Aggregator
          integration has been implemented yet in LivePaymentSheet.tsx.
        </p>
        <p style={{ fontSize: 12, color: '#8B9DB3', margin: '0 0 20px' }}>
          Attempted charge: ₹{amount} — {itemLabel}
        </p>
        <button onClick={onCancel}
          style={{ width: '100%', background: '#7B2FBE', color: '#fff', border: 'none',
            borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          Close
        </button>
      </div>
    </div>
  );
}
