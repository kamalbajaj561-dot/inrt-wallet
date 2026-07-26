/**
 * INRT WALLET — PaymentSheet.tsx
 *
 * The ONLY payment component pages should import. It picks sandbox
 * vs live automatically based on VITE_PAYMENT_MODE (see
 * src/lib/payments/config.ts). Pages never need to know or care
 * which mode is active — that's the whole point of this wrapper.
 */
import { IS_LIVE } from '../lib/payments/config';
import type { PaymentSheetProps } from '../lib/payments/types';
import SandboxPaymentSheet from './SandboxPaymentSheet';
import LivePaymentSheet from './LivePaymentSheet';

export default function PaymentSheet(props: PaymentSheetProps) {
  return IS_LIVE ? <LivePaymentSheet {...props} /> : <SandboxPaymentSheet {...props} />;
}
