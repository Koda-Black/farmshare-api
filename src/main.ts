import { NestFactory } from '@nestjs/core';
import * as passport from 'passport';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger, ValidationPipe, BadRequestException } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { TransactionInterceptor } from './interceptors/transaction.interceptor';
import { PrismaService } from './services/prisma.service';
// Remove this line:
// import { raw } from 'express';
import { HttpExceptionFilter } from './filters/http-exception..filter';
import * as compression from 'compression';
import * as express from 'express'; // <-- Use CommonJS style

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 1. Critical body parsers first
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 2. Compression middleware
  app.use(
    compression({
      level: 6,
      threshold: 0,
    }),
  );

  // 3. CORS Configuration
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://yarnaclient.onrender.com',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Authorization'], // Added exposed headers
    credentials: true,
    maxAge: 600,
  });

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

  // 10. Exception filters (Sentry removed)
  app.useGlobalFilters(new HttpExceptionFilter());

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

  // 12. Server startup
  const PORT = process.env.PORT ?? 5000;
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
