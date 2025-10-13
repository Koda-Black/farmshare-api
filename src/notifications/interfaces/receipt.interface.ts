export interface ReceiptDetails {
  amount: number;
  poolName: string;
  transactionId?: string;
  subscriptionId: string;
  email: string;
  slots: number;
  deliveryFee: number;
  date?: string;
  type?: 'subscription' | 'refund' | 'delivery';
}

export interface NotificationChannel {
  sendReceipt(
    user: { email?: string; phone?: string; name?: string },
    details: ReceiptDetails,
  ): Promise<void>;
}
