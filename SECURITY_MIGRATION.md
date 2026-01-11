# Security Migration Instructions

## Summary

The FarmShare API has been updated with comprehensive security improvements. Before these changes can take effect, you need to run a Prisma migration.

## New Security Tables

The following new tables have been added to the Prisma schema:

1. **OtpAttempt** - Tracks OTP verification attempts for rate limiting and account lockouts
2. **WebhookEvent** - Prevents webhook replay attacks by tracking processed events
3. **PaymentRateLimit** - Rate limits payment initiations per user
4. **SystemMetric** - Stores system health and performance metrics

## Required User Model Updates

The User model now includes bank details fields for Paystack transfers:

- `bankAccountId` - Account number
- `bankCode` - Bank code
- `bankName` - Bank name
- `bankAccountName` - Account holder name
- `paystackRecipientCode` - Paystack transfer recipient code
- `bankVerified` - Whether bank details are verified

## Migration Steps

### Option 1: Fresh Migration (Development)

If you can reset the database:

```bash
cd /Users/macbook/Desktop/FitnessSpace/farmshare-api
npx prisma migrate reset --force
```

### Option 2: Create Migration with Baseline (Production)

If you have existing data:

1. First, ensure your database is in sync with the existing migrations:

   ```bash
   npx prisma migrate deploy
   ```

2. Create a new migration:

   ```bash
   npx prisma migrate dev --name add_security_tables
   ```

3. If there's drift, you may need to resolve it first:

   ```bash
   npx prisma db push
   ```

4. Then create the migration:
   ```bash
   npx prisma migrate dev --name add_security_tables --create-only
   ```

### Option 3: Directly Apply Schema Changes (Dev Only)

For development, you can push changes directly:

```bash
npx prisma db push
npx prisma generate
```

## Environment Variables

Add the following to your `.env` file for identity verification:

```bash
# VerifyMe NIN/CAC Verification (https://verifyme.ng)
VERIFYME_API_KEY=your_verifyme_api_key

# OR Dojah NIN/CAC Verification (https://dojah.io)
DOJAH_APP_ID=your_dojah_app_id
DOJAH_SECRET_KEY=your_dojah_secret_key
```

## Security Features Added

### 1. OTP Brute Force Prevention

- Maximum 5 OTP attempts before 15-minute lockout
- Rate limited to 5 requests per minute
- Located in: `src/auth/auth.service.ts`

### 2. Webhook Replay Prevention

- Both Paystack and Stripe webhooks are now protected
- Duplicate event IDs are rejected
- Events stored for 30 days then cleaned up
- Located in: `src/payments/payments.service.ts`

### 3. Payment Rate Limiting

- Maximum 5 payment initiations per hour
- 3 failed attempts = 30-minute block
- Located in: `src/payments/payments.service.ts`

### 4. OAuth Empty Password Fix

- Google OAuth now generates secure random passwords
- Located in: `src/auth/auth.service.ts`

### 5. Escrow with Paystack Transfers

- Full integration with Paystack Transfer API
- Automatic transfer recipient creation
- Transfer initiation and verification
- Located in: `src/escrow/escrow.service.ts`

### 6. User-Friendly Error Messages

- Different messages for users vs admins
- Common errors translated to friendly language
- Located in: `src/common/filters/user-friendly-error.filter.ts`

### 7. Scheduled Cleanup Tasks

- Hourly security data cleanup
- Daily pending subscription expiry
- 15-minute escrow release check
- 5-minute health metrics collection
- Located in: `src/common/services/scheduled-tasks.service.ts`

### 8. Real NIN/CAC Verification

- Integration with VerifyMe and Dojah providers
- Mock fallback when no API keys configured
- Located in: `src/verification/services/identity-verification.service.ts`

## Files Modified

- `prisma/schema.prisma` - New security models
- `src/app.module.ts` - CommonModule import
- `src/main.ts` - UserFriendlyErrorFilter
- `src/auth/auth.module.ts` - SecurityService
- `src/auth/auth.service.ts` - OTP rate limiting
- `src/auth/auth.controller.ts` - IP address passing
- `src/payments/payments.module.ts` - SecurityService
- `src/payments/payments.service.ts` - Rate limiting, replay prevention
- `src/escrow/escrow.module.ts` - PaystackService
- `src/escrow/escrow.service.ts` - Paystack transfers
- `src/verification/verification.module.ts` - IdentityVerificationService

## New Files Created

- `src/common/common.module.ts`
- `src/common/services/security.service.ts`
- `src/common/services/scheduled-tasks.service.ts`
- `src/common/filters/user-friendly-error.filter.ts`
- `src/verification/services/identity-verification.service.ts`

## Testing

After migration, test the following:

1. **OTP Rate Limiting**: Try 6 OTP verifications in quick succession
2. **Payment Rate Limiting**: Try 6 payment initiations in an hour
3. **Webhook Replay**: Send same webhook event twice
4. **Escrow Release**: Complete a pool and verify transfer
5. **Identity Verification**: Test NIN/CAC endpoints

## Rollback

If you need to rollback:

```bash
npx prisma migrate reset
# OR
git checkout HEAD~1 prisma/schema.prisma
npx prisma db push
```
