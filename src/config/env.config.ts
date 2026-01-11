import * as Joi from 'joi';

export default () => ({
  port: parseInt(process.env.PORT ?? '5000', 10),
  database: {
    url: process.env.DATABASE_URL,
    // url: process.env.PRODUCTION_DB_URL,
  },
  frontendBaseUrl: process.env.FRONTEND_BASE_URL,
  frontendUrl: process.env.FRONTEND_URL,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
  },
  mailjetApiKey: process.env.MAILJET_API_KEY,
  mailjetSecretKey: process.env.MAILJET_SECRET_KEY,
  mailjetSenderEmail: process.env.MAILJET_SENDER_EMAIL,
  // Brevo SMTP (Development)
  brevoHost: process.env.BREVO_HOST,
  brevoPort: parseInt(process.env.BREVO_PORT ?? '2525', 10),
  brevoEmail: process.env.BREVO_EMAIL,
  brevoPassword: process.env.BREVO_PASSWORD,
  // Production SMTP
  emailHost: process.env.EMAIL_HOST,
  emailPort: parseInt(process.env.EMAIL_PORT ?? '465', 10),
  emailUsername: process.env.EMAIL_USERNAME,
  emailPassword: process.env.EMAIL_PASSWORD,
  emailFrom: process.env.EMAIL_FROM,
  emailSenderName: process.env.EMAIL_SENDER_NAME,
  redisHost: process.env.REDIS_HOST,
  redisPort: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  redisPassword: process.env.REDIS_PASSWORD,
  personaWebhookSecret: process.env.PERSONA_WEBHOOK_SECRET,
  sentryDsn: process.env.SENTRY_DSN,
  adminSecretKey: process.env.ADMIN_SECRET_KEY,
  luxand: process.env.LUXAND_API_TOKEN,
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  facepp: {
    apiKey: process.env.FACEPP_API_KEY,
    apiSecret: process.env.FACEPP_API_SECRET,
  },
  coingate: {
    apiKey:
      process.env.COINGATE_API_KEY || process.env.COINGATE_SANDBOX_API_KEY, // Fallback to sandbox key
    sandboxApiKey: process.env.COINGATE_SANDBOX_API_KEY,
    webhookSecret: process.env.COINGATE_WEBHOOK_SECRET,
    sandboxMode: process.env.COINGATE_SANDBOX_MODE === 'true',
  },
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY,
    testMode: process.env.PAYSTACK_TEST_MODE === 'true',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
});

export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(5000),
  DATABASE_URL: Joi.string().required(),
  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
  GOOGLE_CALLBACK_URL: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('3d'),
  FRONTEND_URL: Joi.string().required(),
  // Brevo SMTP (Development) - optional as only needed in dev
  BREVO_HOST: Joi.string().optional(),
  BREVO_PORT: Joi.number().optional(),
  BREVO_EMAIL: Joi.string().optional(),
  BREVO_PASSWORD: Joi.string().optional(),
  // Production SMTP - optional as only needed in prod
  EMAIL_HOST: Joi.string().optional(),
  EMAIL_PORT: Joi.number().optional(),
  EMAIL_USERNAME: Joi.string().optional(),
  EMAIL_PASSWORD: Joi.string().optional(),
  EMAIL_FROM: Joi.string().optional(),
  EMAIL_SENDER_NAME: Joi.string().optional(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().required(),
  REDIS_PASSWORD: Joi.string().allow(''),
  PERSONA_WEBHOOK_SECRET: Joi.string().allow(''),
  SENTRY_DSN: Joi.string().required(),
  FRONTEND_BASE_URL: Joi.string().required(),
  CLOUDINARY_CLOUD_NAME: Joi.string().required(),
  CLOUDINARY_API_KEY: Joi.string().required(),
  CLOUDINARY_API_SECRET: Joi.string().required(),
  FACEPP_API_KEY: Joi.string().required(),
  FACEPP_API_SECRET: Joi.string().required(),
  LUXAND_API_TOKEN: Joi.string().required(),
  ADMIN_SECRET_KEY: Joi.string().required(),
  COINGATE_API_KEY: Joi.string().optional(), // Made optional for Sandbox-only
  COINGATE_SANDBOX_API_KEY: Joi.string().required(),
  COINGATE_WEBHOOK_SECRET: Joi.string().required(),
  COINGATE_SANDBOX_MODE: Joi.boolean().default(true),
  PAYSTACK_SECRET_KEY: Joi.string().required(),
  PAYSTACK_TEST_MODE: Joi.boolean().default(true),
  STRIPE_SECRET_KEY: Joi.string().required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().required(),
});
