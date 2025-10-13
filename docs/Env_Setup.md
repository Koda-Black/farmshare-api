# Environment Setup

Copy `.env.example` to `.env` and fill values.

## Required Keys

- PAYSTACK_SECRET_KEY, PAYSTACK_CALLBACK_URL
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- FIREBASE_SERVER_KEY or ONESIGNAL_APP_ID/ONESIGNAL_API_KEY
- CLOUDINARY credentials or S3 credentials
- OPENAI_API_KEY
- GOOGLE_MAPS_API_KEY
- SENDGRID or RESEND or MAILGUN keys
- DATABASE_URL, FRONTEND_URL

## Notes

- Webhooks: ensure raw body is passed through reverse proxy.
- CORS/CSP: set FRONTEND_URL appropriately for prod.
