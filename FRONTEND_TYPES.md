# FarmShare Frontend TypeScript Types

## Core Types

```typescript
// User Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'buyer' | 'vendor' | 'admin' | 'superadmin';
  isVerified: boolean;
  verificationStatus: 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  ninVerified: boolean;
  bankVerified: boolean;
  isAdmin: boolean;
  phone?: string;
  createdAt: string;
  lastActive?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// Verification Types
export interface Verification {
  id: string;
  userId: string;
  step: string;
  status: 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  details: any;
  externalReference?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface VerificationStatus {
  overallStatus: 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  ninVerified: boolean;
  bankVerified: boolean;
  verifications: Verification[];
}

export interface Bank {
  id: number;
  name: string;
  code: string;
  active: boolean;
}

export interface FaceVerificationResult {
  success: boolean;
  confidence?: number;
  facesDetected?: number;
  message?: string;
  error?: string;
}

export interface DocumentOcrResult {
  success: boolean;
  fullName?: string;
  documentNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  documentType?: string;
  confidence?: number;
  message?: string;
}

export interface CacVerificationResult {
  success: boolean;
  companyName?: string;
  registrationNumber?: string;
  registrationDate?: string;
  businessType?: string;
  status?: string;
  message?: string;
}

// Pool Types
export interface Pool {
  id: string;
  productId: string;
  vendorId: string;
  pricePerSlot: number;
  slotsCount: number;
  slotsFilled: number;
  status: 'OPEN' | 'FILLED' | 'IN_DELIVERY' | 'COMPLETED' | 'CANCELLED';
  filledAt?: string;
  deliveryDeadlineUtc?: string;
  allowHomeDelivery: boolean;
  product?: Product;
  vendor?: User;
  subscriptions?: Subscription[];
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  images: string[];
  price: number;
  unit: string;
  quantity: number;
  minOrder: number;
  farmLocation: string;
  harvestDate: string;
  expiryDate: string;
  organic: boolean;
  certified: boolean;
}

export interface Subscription {
  id: string;
  userId: string;
  poolId: string;
  slots: number;
  amountPaid: number;
  deliveryFee: number;
  paymentMethod: 'STRIPE' | 'PAYSTACK';
  paymentRef: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  createdAt: string;
  user?: User;
}

// Payment Types
export interface PaymentInit {
  method: 'STRIPE' | 'PAYSTACK';
  poolId: string;
  slots: number;
  waybillWithin: boolean;
  waybillOutside: boolean;
}

export interface PaymentResponse {
  method: 'STRIPE' | 'PAYSTACK';
  url: string;
  reference?: string;
  pendingId: string;
}

export interface PendingSubscription {
  id: string;
  userId: string;
  poolId: string;
  slots: number;
  deliveryFee: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  gateway: 'STRIPE' | 'PAYSTACK';
  stripeSessionId?: string;
  paystackRef?: string;
}

// Escrow Types
export interface Escrow {
  id: string;
  poolId: string;
  totalHeld: number;
  releasedAmount: number;
  withheldAmount: number;
  withheldReason?: string;
  computations: any;
  createdAt: string;
  updatedAt: string;
}

export interface EscrowDetails {
  escrow: Escrow;
  calculations: {
    commission: number;
    netForVendor: number;
    commissionRate: number;
  };
  pool: Pool;
}

export interface ReleaseEscrowDto {
  poolId: string;
  reason?: string;
}

export interface ManualReleaseDto {
  poolId: string;
  amount: number;
  reason: string;
}

export interface ManualRefundDto {
  transactionId: string;
  amount: number;
  reason: string;
}

// Dispute Types
export interface Dispute {
  id: string;
  poolId: string;
  raisedByUserId: string;
  reason: string;
  status: 'open' | 'in_review' | 'resolved' | 'rejected';
  evidenceFiles: string[];
  complainantCount: number;
  resolutionNotes?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
  pool?: Pool;
  raisedBy?: User;
}

export interface CreateDisputeDto {
  poolId: string;
  reason: string;
  files?: File[];
}

export interface ResolveDisputeDto {
  disputeId: string;
  action: 'refund' | 'release' | 'split';
  distribution?: Record<string, number>;
  resolutionNotes?: string;
}

export interface DisputeTimeline {
  event: string;
  timestamp: Date;
  actor: string | null;
  details: {
    reason?: string;
    evidenceCount?: number;
    status?: string;
    notes?: string;
  };
}

// Admin Types
export interface AdminSignupDto {
  email: string;
  name: string;
  password: string;
  adminSecretKey: string;
}

export interface AdminLoginDto {
  email: string;
  password: string;
}

export interface AdminMfaDto {
  email: string;
  token: string;
}

export interface SearchUsersDto {
  search?: string;
  role?: 'buyer' | 'vendor' | 'admin';
  isVerified?: boolean;
  page?: number;
  limit?: number;
}

export interface UpdateUserDto {
  userId: string;
  name?: string;
  phone?: string;
  role?: string;
  isVerified?: boolean;
}

export interface BanUserDto {
  userId: string;
  reason: string;
}

export interface UnbanUserDto {
  userId: string;
}

export interface ApproveVerificationDto {
  verificationId: string;
  notes?: string;
}

export interface RejectVerificationDto {
  verificationId: string;
  reason: string;
  feedback?: string;
}

export interface GetPendingVerificationsDto {
  page?: number;
  limit?: number;
  status?: string;
}

export interface GetDisputesDto {
  page?: number;
  limit?: number;
  status?: string;
}

export interface UpdateDisputeStatusDto {
  disputeId: string;
  status: string;
  notes?: string;
}

export interface ResolveDisputeDto {
  disputeId: string;
  resolution: string;
  distribution?: {
    buyer: number;
    vendor: number;
  };
}

export interface AdminAuditLog {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: any;
  createdAt: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
}

// Form Types
export interface SignUpDto {
  email: string;
  password: string;
  name: string;
  role: 'buyer' | 'vendor';
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface VerifyOtpDto {
  email: string;
  otp: string;
}

export interface VerifyBankDto {
  accountNumber: string;
  bankCode: string;
}

export interface VerifyFaceDto {
  selfieImage: string;
  idCardImage: string;
  confidenceThreshold?: number;
}

export interface VerifyDocumentDto {
  document: File;
  documentType?: 'NIN' | 'PASSPORT' | 'DRIVERS_LICENSE' | 'VOTER_CARD';
}

export interface VerifyCacDto {
  registrationNumber: string;
  companyName: string;
}

export interface StartVerificationDto {
  userId?: string;
  steps: string[];
}

export interface SubmitVerificationDto {
  verificationId: string;
  metadata: any;
  files: File[];
}

// Notification Types
export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  push: boolean;
  disputes: boolean;
  payments: boolean;
  deliveries: boolean;
  updates: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'payment' | 'dispute' | 'delivery' | 'verification' | 'system';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  metadata?: any;
}

// Dashboard Types
export interface AdminDashboard {
  totalUsers: number;
  totalVendors: number;
  totalBuyers: number;
  totalPools: number;
  activePools: number;
  completedPools: number;
  totalRevenue: number;
  pendingVerifications: number;
  openDisputes: number;
  recentActivity: AdminAuditLog[];
}

export interface VendorDashboard {
  totalPools: number;
  activePools: number;
  completedPools: number;
  totalRevenue: number;
  pendingEarnings: number;
  averageRating: number;
  totalSubscriptions: number;
  recentPools: Pool[];
  upcomindDeliveries: Pool[];
}

export interface BuyerDashboard {
  activeSubscriptions: Subscription[];
  recentPurchases: Pool[];
  totalSpent: number;
  savings: number;
  verificationStatus: VerificationStatus;
  notifications: Notification[];
}

// File Upload Types
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadedFile {
  name: string;
  url: string;
  size: number;
  type: string;
}

// Utility Types
export type SortDirection = 'asc' | 'desc';
export type FilterStatus = 'all' | 'open' | 'in_review' | 'resolved' | 'rejected';
export type DateRange = {
  start: Date;
  end: Date;
};

// Error Types
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface FormErrors {
  [key: string]: string | undefined;
}

// Chart/Analytics Types
export interface RevenueData {
  date: string;
  revenue: number;
  transactions: number;
}

export interface DisputeMetrics {
  period: {
    start?: Date;
    end?: Date;
  };
  totalDisputes: number;
  resolvedDisputes: number;
  rejectedDisputes: number;
  openDisputes: number;
  resolutionRate: number;
  averageResolutionTimeHours: number;
}

export interface VerificationStats {
  total: number;
  verified: number;
  pending: number;
  rejected: number;
  expired: number;
  successRate: number;
}

// Webhook Types
export interface PaystackWebhookPayload {
  event: string;
  data: {
    reference: string;
    amount: number;
    status: string;
    metadata: any;
  };
}

export interface StripeWebhookPayload {
  type: string;
  data: {
    object: {
      id: string;
      status: string;
      metadata: any;
    };
  };
}
```

## React Component Props

```typescript
// Common Props
export interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  onRowClick?: (item: T) => void;
  actions?: (item: T) => React.ReactNode;
}

export interface FormFieldProps {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel';
  placeholder?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}

export interface FileUploadProps {
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  onUpload: (files: File[]) => void;
  onProgress?: (progress: UploadProgress) => void;
  error?: string;
}

// Component Specific Props
export interface VerificationFlowProps {
  onComplete: (status: VerificationStatus) => void;
  onError: (error: string) => void;
  initialStep?: number;
}

export interface PaymentFormProps {
  poolId: string;
  availableSlots: number;
  pricePerSlot: number;
  onPaymentSuccess: (subscription: Subscription) => void;
  onPaymentError: (error: string) => void;
}

export interface DisputeFormProps {
  poolId: string;
  onSubmit: (dispute: Dispute) => void;
  onCancel: () => void;
}

export interface EscrowDetailsProps {
  poolId: string;
  isAdmin?: boolean;
  onRelease?: () => void;
  onRefund?: (amount: number) => void;
}

export interface AdminUserManagementProps {
  onUserUpdate: (user: User) => void;
  onUserBan: (userId: string) => void;
  onUserUnban: (userId: string) => void;
}

export interface VerificationReviewProps {
  onApprove: (verificationId: string) => void;
  onReject: (verificationId: string, reason: string) => void;
}

export interface DisputeResolutionProps {
  dispute: Dispute;
  onResolve: (resolution: ResolveDisputeDto) => void;
  onEscalate: (disputeId: string, notes: string) => void;
}
```

## Custom Hook Types

```typescript
export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface UseAuthResult {
  user: User | null;
  tokens: AuthTokens | null;
  login: (credentials: LoginDto) => Promise<void>;
  signup: (userData: SignUpDto) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

export interface UseVerificationResult {
  status: VerificationStatus | null;
  startVerification: (steps: string[]) => Promise<void>;
  submitDocuments: (verificationId: string, files: File[], metadata: any) => Promise<void>;
  uploadProgress: UploadProgress | null;
  loading: boolean;
  error: string | null;
}

export interface UsePaymentResult {
  initiatePayment: (paymentData: PaymentInit) => Promise<PaymentResponse>;
  verifyPayment: (reference: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export interface UseDisputesResult {
  disputes: Dispute[];
  createDispute: (disputeData: CreateDisputeDto) => Promise<void>;
  resolveDispute: (resolution: ResolveDisputeDto) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export interface UseEscrowResult {
  escrow: EscrowDetails | null;
  releaseEscrow: (poolId: string, reason?: string) => Promise<void>;
  manualRelease: (data: ManualReleaseDto) => Promise<void>;
  loading: boolean;
  error: string | null;
}
```

## Context Types

```typescript
export interface AppContextType {
  user: User | null;
  tokens: AuthTokens | null;
  notifications: Notification[];
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => void;
  markNotificationRead: (id: string) => void;
}

export interface VerificationContextType {
  currentStep: number;
  completedSteps: string[];
  documents: Record<string, File[]>;
  setCurrentStep: (step: number) => void;
  addDocument: (step: string, files: File[]) => void;
  removeDocument: (step: string, index: number) => void;
  reset: () => void;
}

export interface PaymentContextType {
  selectedPool: Pool | null;
  selectedSlots: number;
  deliveryOption: 'within' | 'outside' | 'pickup';
  setSelectedPool: (pool: Pool) => void;
  setSelectedSlots: (slots: number) => void;
  setDeliveryOption: (option: 'within' | 'outside' | 'pickup') => void;
  calculateTotal: () => number;
  reset: () => void;
}
```

## Environment Types

```typescript
export interface EnvConfig {
  apiUrl: string;
  stripePublicKey: string;
  paystackPublicKey: string;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  enableAnalytics: boolean;
  enableDebug: boolean;
  maxFileSize: number;
  supportedFileTypes: string[];
}
```

These types provide comprehensive type coverage for the entire FarmShare frontend application, ensuring type safety across all components, hooks, and API interactions.