# FarmShare API - Frontend Integration Guide

## Overview

This guide provides complete API documentation for frontend developers integrating with the FarmShare marketplace API. The API includes user authentication, verification, payments, escrow, disputes, and admin management.

## Base URL

```
Development: http://localhost:5000
Production:  https://api.farmshare.com
```

## Authentication

All API endpoints (except auth endpoints) require a Bearer token in the Authorization header:

```
Authorization: Bearer {jwt_token}
```

## API Endpoints

### 1. Authentication Module

#### User Registration
```http
POST /auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe",
  "role": "buyer" | "vendor"
}
```

**Response:**
```json
{
  "message": "OTP sent to your email"
}
```

#### Verify Email (OTP)
```http
POST /auth/verify-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "user@example.com",
    "role": "buyer"
  }
}
```

#### User Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

#### Refresh Token
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJ..."
}
```

### 2. Verification Module

#### Get Supported Banks
```http
GET /verification/banks
Authorization: Bearer {token}
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Guaranty Trust Bank",
    "code": "058",
    "active": true
  }
]
```

#### Verify Bank Account
```http
POST /verification/bank
Authorization: Bearer {token}
Content-Type: application/json

{
  "accountNumber": "0123456789",
  "bankCode": "058"
}
```

#### Verify Face (Selfie vs ID Document)
```http
POST /verification/face
Authorization: Bearer {token}
Content-Type: application/json

{
  "selfieImage": "data:image/jpeg;base64,/9j/4AAQ...",
  "idCardImage": "data:image/jpeg;base64,/9j/4AAQ...",
  "confidenceThreshold": 70
}
```

#### Extract Document Data (OCR)
```http
POST /verification/document/ocr
Authorization: Bearer {token}
Content-Type: multipart/form-data

document: <file>
documentType: "NIN" | "PASSPORT" | "DRIVERS_LICENSE" | "VOTER_CARD"
```

#### Verify Business Registration (CAC)
```http
POST /verification/cac
Authorization: Bearer {token}
Content-Type: application/json

{
  "registrationNumber": "RC123456",
  "companyName": "Farmshare Technologies Limited"
}
```

#### Start Verification Process
```http
POST /verification/start
Authorization: Bearer {token}
Content-Type: application/json

{
  "steps": ["govt_id", "bank", "business_reg"]
}
```

#### Submit Verification Documents
```http
POST /verification/submit
Authorization: Bearer {token}
Content-Type: multipart/form-data

verificationId: <uuid>
metadata: {"idType": "NIN", "idNumber": "12345678901"}
files: [<file1>, <file2>]
```

#### Get Verification Status
```http
GET /verification/status
Authorization: Bearer {token}
```

**Response:**
```json
{
  "overallStatus": "VERIFIED",
  "ninVerified": true,
  "bankVerified": true,
  "verifications": [
    {
      "id": "uuid",
      "step": "govt_id",
      "status": "VERIFIED",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "expiresAt": "2024-01-31T00:00:00.000Z"
    }
  ]
}
```

### 3. Payment Module

#### Initiate Payment (Unified Stripe + Paystack)
```http
POST /payments/pay
Authorization: Bearer {token}
Content-Type: application/json

{
  "method": "STRIPE" | "PAYSTACK",
  "poolId": "uuid",
  "slots": 2,
  "waybillWithin": true,
  "waybillOutside": false
}
```

**Response (Stripe):**
```json
{
  "method": "STRIPE",
  "url": "https://checkout.stripe.com/pay/...",
  "pendingId": "uuid"
}
```

**Response (Paystack):**
```json
{
  "method": "PAYSTACK",
  "url": "https://checkout.paystack.com/...",
  "reference": "reference123",
  "pendingId": "uuid"
}
```

#### Verify Paystack Payment
```http
POST /payments/paystack/verify?reference=reference123
```

### 4. Escrow Module

#### Get Escrow Details
```http
GET /escrow/{poolId}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "escrow": {
    "id": "uuid",
    "poolId": "uuid",
    "totalHeld": 100000,
    "releasedAmount": 0,
    "withheldAmount": 0,
    "withheldReason": null,
    "computations": {}
  },
  "calculations": {
    "commission": 5000,
    "netForVendor": 95000,
    "commissionRate": 0.05
  },
  "pool": {
    "id": "uuid",
    "vendor": { "name": "Vendor Name" }
  }
}
```

#### Release Escrow (Automatic)
```http
POST /escrow/release
Authorization: Bearer {token}
Content-Type: application/json

{
  "poolId": "uuid",
  "reason": "Delivery confirmed"
}
```

#### Partial Release (For Disputes)
```http
POST /escrow/partial-release
Authorization: Bearer {token}
Content-Type: application/json

{
  "poolId": "uuid",
  "releaseMap": {
    "userId1": 50000,
    "userId2": 30000
  }
}
```

### 5. Disputes Module

#### Create Dispute
```http
POST /disputes/create
Authorization: Bearer {token}
Content-Type: multipart/form-data

poolId: <uuid>
reason: <string>
files: [<file1>, <file2>]
```

#### Get Dispute Details
```http
GET /disputes/{disputeId}
Authorization: Bearer {token}
```

#### Get Pool Disputes
```http
GET /disputes/pool/{poolId}
Authorization: Bearer {token}
```

#### Get User's Disputes
```http
GET /disputes/user/{userId}
Authorization: Bearer {token}
```

#### Add Evidence to Dispute
```http
POST /disputes/{disputeId}/evidence
Authorization: Bearer {token}
Content-Type: multipart/form-data

files: [<file1>, <file2>]
notes: "Additional evidence notes"
```

### 6. Admin Module

#### Admin Login
```http
POST /admin/login
Content-Type: application/json

{
  "email": "admin@farmshare.com",
  "password": "adminPassword"
}
```

**Response (with MFA):**
```json
{
  "requiresMfa": true,
  "message": "Please provide MFA code"
}
```

#### Verify MFA During Login
```http
POST /admin/login/mfa
Content-Type: application/json

{
  "email": "admin@farmshare.com",
  "token": "123456"
}
```

#### Search Users
```http
GET /admin/users?search=john&role=vendor&page=1&limit=20
Authorization: Bearer {admin_token}
```

#### Get User Details
```http
GET /admin/users/{userId}
Authorization: Bearer {admin_token}
```

#### Update User
```http
PATCH /admin/users/{userId}
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "name": "Updated Name",
  "phone": "+2348000000000"
}
```

#### Ban User
```http
POST /admin/users/ban
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "userId": "uuid",
  "reason": "Violation of terms"
}
```

#### Get Pending Verifications
```http
GET /admin/verifications/pending?page=1&limit=20
Authorization: Bearer {admin_token}
```

#### Approve Verification
```http
POST /admin/verifications/approve
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "verificationId": "uuid",
  "notes": "Documents verified successfully"
}
```

#### Reject Verification
```http
POST /admin/verifications/reject
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "verificationId": "uuid",
  "reason": "Invalid documents",
  "feedback": "Please upload clearer ID photos"
}
```

#### Get Pending Disputes
```http
GET /admin/disputes/pending
Authorization: Bearer {admin_token}
```

#### Resolve Dispute
```http
POST /admin/disputes/resolve
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "disputeId": "uuid",
  "action": "refund" | "release" | "split",
  "distribution": {
    "userId1": 50000,
    "userId2": 30000
  },
  "resolutionNotes": "Partial refund approved"
}
```

#### Manual Escrow Release
```http
POST /admin/escrow/manual-release
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "poolId": "uuid",
  "amount": 50000,
  "reason": "Manual override"
}
```

#### Manual Refund
```http
POST /admin/escrow/manual-refund
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "transactionId": "uuid",
  "amount": 50000,
  "reason": "Refund for poor quality"
}
```

## Error Handling

All API errors follow this format:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

Common HTTP Status Codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `500` - Internal Server Error

## Rate Limiting

API endpoints are rate-limited to prevent abuse:
- General endpoints: 100 requests per minute
- Payment endpoints: 10 requests per minute
- Verification endpoints: 20 requests per minute

## File Uploads

- Maximum file size: 5MB per file
- Supported formats: JPEG, PNG, PDF
- Upload endpoints use `multipart/form-data`

## Webhooks

### Paystack Webhook
```http
POST /payments/paystack/webhook
Headers: x-paystack-signature
```

### Stripe Webhook
```http
POST /payments/stripe/webhook
Headers: stripe-signature
```

## Testing

Use the test environment with these credentials:
- Test Paystack Key: `sk_test_...`
- Test Stripe Key: `sk_test_...`

## Frontend Integration Examples

### React Example - Payment Initiation
```javascript
const initiatePayment = async (poolId, slots) => {
  try {
    const response = await fetch('/api/payments/pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        method: 'PAYSTACK',
        poolId,
        slots,
        waybillWithin: true,
        waybillOutside: false
      })
    });

    const data = await response.json();

    // Redirect to payment page
    window.location.href = data.url;
  } catch (error) {
    console.error('Payment initiation failed:', error);
  }
};
```

### React Example - File Upload for Verification
```javascript
const uploadVerificationDocuments = async (verificationId, files, metadata) => {
  const formData = new FormData();
  formData.append('verificationId', verificationId);
  formData.append('metadata', JSON.stringify(metadata));

  files.forEach(file => {
    formData.append('files', file);
  });

  try {
    const response = await fetch('/api/verification/submit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    return await response.json();
  } catch (error) {
    console.error('Document upload failed:', error);
  }
};
```

## Environment Variables

Ensure your frontend environment has:
```env
REACT_APP_API_BASE_URL=http://localhost:5000
REACT_APP_STRIPE_PUBLIC_KEY=pk_test_...
REACT_APP_PAYSTACK_PUBLIC_KEY=pk_test_...
```

## Support

For API integration support:
1. Check this documentation first
2. Review API responses for error details
3. Contact the development team for technical issues

## Security Notes

1. **Never expose secret keys** in frontend code
2. **Always validate user input** before sending to API
3. **Use HTTPS** in production
4. **Implement proper error handling** for user experience
5. **Store tokens securely** (httpOnly cookies recommended)

## Changelog

### v1.0.0
- Initial API release
- User authentication and verification
- Payment processing with Stripe and Paystack
- Escrow and dispute management
- Admin dashboard endpoints