import { NestFactory } from '@nestjs/core';
import * as passport from 'passport';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger, ValidationPipe, BadRequestException } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { TransactionInterceptor } from './interceptors/transaction.interceptor';
import { PrismaService } from './services/prisma.service';
import { QueueService } from './queues/queue.service';
// Remove this line:
// import { raw } from 'express';
import { HttpExceptionFilter } from './filters/http-exception..filter';
import { UserFriendlyErrorFilter } from './common/filters/user-friendly-error.filter';
import * as compression from 'compression';
import * as express from 'express'; // <-- Use CommonJS style
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { envConfig } from './config/environment.config';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Log environment configuration on startup
  envConfig.logConfig();
  const apiConfig = envConfig.getApiConfig();
  const isProduction = envConfig.getEnvironment().isProduction;

  // 1. Critical body parsers first
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // 2. Compression middleware
  app.use(
    compression({
      level: 6,
      threshold: 0,
    }),
  );

  // Security headers (CSP + other helmet protections)
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:', 'http:'],
          connectSrc: ["'self'", ...apiConfig.allowedOrigins].filter(Boolean),
          frameAncestors: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // 3. CORS Configuration - Environment-aware
  app.enableCors({
    origin: apiConfig.allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Authorization'],
    credentials: true,
    maxAge: 600,
  });

  // ============================================================================
  // SECURITY: Rate Limiting for Critical Endpoints
  // ============================================================================

  // Auth endpoints rate limiting - stricter limits for login/signup
  app.use(
    '/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // 10 attempts per 15 minutes
      message: {
        success: false,
        message: 'Too many login attempts. Please try again after 15 minutes.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use(
    '/auth/signup/*',
    rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5, // 5 signups per hour per IP
      message: {
        success: false,
        message: 'Too many signup attempts. Please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use(
    '/auth/forgot-password',
    rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5, // 5 requests per hour
      message: {
        success: false,
        message: 'Too many password reset requests. Please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use(
    '/auth/resend-otp',
    rateLimit({
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 3, // 3 OTP resends per 5 minutes
      message: {
        success: false,
        message:
          'Too many OTP requests. Please wait 5 minutes before requesting again.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use(
    '/auth/verify-otp',
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // 10 OTP verification attempts
      message: {
        success: false,
        message: 'Too many OTP verification attempts. Please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Admin auth rate limiting
  app.use(
    '/admin/auth/*',
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 attempts per 15 minutes
      message: {
        success: false,
        message: 'Too many admin login attempts. Please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Add to webhook routes
  app.use(
    '/payments/*/webhook',
    rateLimit({
      windowMs: 60000,
      max: 100,
    }),
  );

  // Stripe webhook needs raw body
  app.use(
    '/payments/stripe/webhook',
    bodyParser.raw({ type: 'application/json' }),
  );

  // Paystack webhook needs raw body for HMAC verification
  app.use(
    '/payments/paystack/webhook',
    bodyParser.raw({ type: 'application/json' }),
  );

  // 4. HTTPS redirect middleware
  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (
        req.header('x-forwarded-proto') !== 'https' &&
        process.env.NODE_ENV === 'production'
      ) {
        res.redirect(`https://${req.header('host')}${req.url}`);
      } else {
        next();
      }
    },
  );

  // 5. Authentication initialization
  app.use(passport.initialize());

  // 6. Static assets serving
  app.useStaticAssets(join(__dirname, '..', 'public'));

  // 7. Global interceptors
  app.useGlobalInterceptors(new TransactionInterceptor(app.get(PrismaService)));

  // 8. Webhook-specific raw body parser
  // app.use('/webhooks/persona', raw({ type: '*/*' }));

  // 9. Enhanced validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        logger.error('Validation errors:', JSON.stringify(errors, null, 2));
        return new BadRequestException({
          success: false,
          message: 'Validation failed',
          errors: errors.map((e) => ({
            property: e.property,
            constraints: e.constraints,
          })),
        });
      },
    }),
  );

  // 10. Exception filters - UserFriendlyErrorFilter for user-friendly messages, HttpExceptionFilter for detailed logging
  app.useGlobalFilters(
    new UserFriendlyErrorFilter(),
    new HttpExceptionFilter(),
  );

  // 11. Swagger configuration with enhanced options
  const config = new DocumentBuilder()
    .setTitle('Backend API')
    .setDescription('The backend API description')
    .setVersion('1.0')
    .addTag('APIs')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document, {
    jsonDocumentUrl: 'swagger/json',
    swaggerOptions: {
      defaultModelsExpandDepth: -1,
      syntaxHighlight: {
        activate: true,
        theme: 'monokai',
      },
      persistAuthorization: true,
      security: [{ 'JWT-auth': [] }], // Added global security
    },
  });

  // 12. Initialize scheduled jobs
  const queueService = app.get(QueueService);

  // Initialize scheduled escrow release job (runs every minute for 5min testing grace period)
  try {
    await queueService.addScheduledEscrowReleaseJob();
    logger.log(
      '✅ Scheduled escrow release job initialized (every minute for 5min testing)',
    );
  } catch (error) {
    logger.error('Failed to initialize scheduled escrow release job:', error);
  }

  // 13. Server startup
  const PORT = process.env.PORT ?? 8282;
  await app.listen(PORT);

  logger.log(`Server is listening at http://localhost:${PORT}`);
  logger.log(`Swagger UI available at http://localhost:${PORT}/swagger`);

  console.info(`
  --------------------------------------------------
    Server is listening http://localhost:${PORT}
  --------------------------------------------------
  `);
}

bootstrap().catch((error: Error) => {
  logger.error('Failed to bootstrap application', error.stack);
  process.exit(1);
});
