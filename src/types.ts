export interface UserProfile {
  uid: string;
  phoneNumber: string | null;
  fullName?: string;
  walletBalance: number;
  kycTier: 'TIER_1' | 'TIER_2';
  accountStatus: 'active' | 'frozen';
  createdAt: number; // Timestamp
  isAdmin?: boolean;
  upiId?: string;
  accountType?: 'user' | 'merchant';
  merchantName?: string;
  upiPinEnabled?: boolean;
}

export interface Transaction {
  id: string;
  senderId: string;
  receiverId: string; // This will be the UID
  receiverPhoneNumber?: string; // For display
  senderPhoneNumber?: string; // For display
  amount: number;
  timestamp: number;
  status: 'success' | 'failed' | 'pending';
  type: 'transfer' | 'deposit' | 'withdrawal' | 'merchant_payment' | 'qr_payment' | 'upi_payment' | 'request_payment' | 'wallet_deposit' | 'bank_payment' | 'wallet_transfer' | 'subscription_payment' | 'split_payment';
  description?: string;
  note?: string;
  category?: 'Food' | 'Shopping' | 'Travel' | 'Bills' | 'Rent' | 'Entertainment' | 'Others';
  paymentMethod?: 'razorpay' | 'wallet' | 'bank_transfer' | 'upi';
}

export interface Subscription {
  id: string;
  userId: string;
  merchantName: string;
  amount: number;
  interval: 'daily' | 'weekly' | 'monthly';
  nextPaymentDate: number;
  status: 'active' | 'paused' | 'cancelled';
  paymentMethod: 'wallet';
  createdAt: number;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'payment_received' | 'payment_sent' | 'payment_request' | 'request_approved' | 'request_declined' | 'subscription_payment' | 'split_request' | 'split_settled';
  title: string;
  message: string;
  amount?: number;
  status: 'unread' | 'read';
  timestamp: number;
}

export interface SplitParticipant {
  userId: string;
  name: string;
  phoneNumber?: string;
  amount: number;
  status: 'pending' | 'paid' | 'declined';
}

export interface SplitPayment {
  id: string;
  creatorId: string;
  creatorName: string;
  totalAmount: number;
  note: string;
  participants: SplitParticipant[];
  createdAt: number;
  status: 'pending' | 'completed';
}

export interface PaymentRequest {
  requestId: string;
  senderId: string; // User requesting money
  senderName: string;
  senderUpiId?: string;
  receiverId: string; // User who needs to pay
  receiverUpiId?: string;
  amount: number;
  status: 'pending' | 'approved' | 'declined' | 'expired';
  timestamp: number;
  description?: string;
  splitId?: string;
}

export interface BankAccount {
  id: string;
  userId: string;
  bankName: string;
  accountNumberMasked: string;
  ifsc: string;
  upiId: string;
  verified: boolean;
  createdAt: number;
}

export const TIER_LIMITS = {
  TIER_1: 10000,
  TIER_2: 100000,
};
