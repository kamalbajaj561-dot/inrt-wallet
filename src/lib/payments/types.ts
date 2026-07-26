export interface PaymentSheetProps {
  amount: number;
  itemLabel: string;
  onCancel: () => void;
  onDone: (success: boolean, refId: string) => void;
}
