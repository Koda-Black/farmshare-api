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
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  sendgridSenderEmail: process.env.SENDGRID_SENDER_EMAIL,
  sendgridSenderName: process.env.SENDGRID_SENDER_NAME,
  redisHost: process.env.REDIS_HOST,
  redisPort: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  redisPassword: process.env.REDIS_PASSWORD,
  personaWebhookSecret: process.env.PERSONA_WEBHOOK_SECRET,
  sentryDsn: process.env.SENTRY_DSN,
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
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
  SENDGRID_API_KEY: Joi.string().required(),
  SENDGRID_SENDER_NAME: Joi.string().required(),
  SENDGRID_SENDER_EMAIL: Joi.string().email().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().required(),
  REDIS_PASSWORD: Joi.string().allow(''),
  PERSONA_WEBHOOK_SECRET: Joi.string().allow(''),
  SENTRY_DSN: Joi.string().required(),
  FRONTEND_BASE_URL: Joi.string().required(),
  CLOUDINARY_CLOUD_NAME: Joi.string().required(),
  CLOUDINARY_API_KEY: Joi.string().required(),
  CLOUDINARY_API_SECRET: Joi.string().required(),
  COINGATE_API_KEY: Joi.string().optional(), // Made optional for Sandbox-only
  COINGATE_SANDBOX_API_KEY: Joi.string().required(),
  COINGATE_WEBHOOK_SECRET: Joi.string().required(),
  COINGATE_SANDBOX_MODE: Joi.boolean().default(true),
  PAYSTACK_SECRET_KEY: Joi.string().required(),
  PAYSTACK_TEST_MODE: Joi.boolean().default(true),
  STRIPE_SECRET_KEY: Joi.string().required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().required(),
});
