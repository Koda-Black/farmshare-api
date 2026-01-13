/**
 * Environment Configuration Service
 *
 * This module provides environment-aware configuration for:
 * - Database connections (local vs production)
 * - Payment providers (Paystack, Stripe) with test/live modes
 * - API URLs based on NODE_ENV
 *
 * Usage:
 *   import { EnvironmentConfig } from './config/environment.config';
 *   const config = EnvironmentConfig.getInstance();
 *   const dbUrl = config.getDatabaseUrl();
 */

export interface EnvironmentSettings {
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  nodeEnv: string;
}

export interface DatabaseConfig {
  url: string;
  ssl: boolean;
  connectionTimeout: number;
  poolSize: number;
}

export interface PaystackConfig {
  secretKey: string;
  publicKey: string;
  baseUrl: string;
  isTestMode: boolean;
}

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  isTestMode: boolean;
}

export interface ApiConfig {
  frontendUrl: string;
  backendUrl: string;
  allowedOrigins: string[];
}

export class EnvironmentConfig {
  private static instance: EnvironmentConfig;
  private env: EnvironmentSettings;

  private constructor() {
    const nodeEnv = process.env.NODE_ENV || 'development';
    this.env = {
      nodeEnv,
      isProduction: nodeEnv === 'production',
      isDevelopment: nodeEnv === 'development',
      isTest: nodeEnv === 'test',
    };
  }

  public static getInstance(): EnvironmentConfig {
    if (!EnvironmentConfig.instance) {
      EnvironmentConfig.instance = new EnvironmentConfig();
    }
    return EnvironmentConfig.instance;
  }

  /**
   * Get environment settings
   */
  public getEnvironment(): EnvironmentSettings {
    return this.env;
  }

  /**
   * Get database configuration based on environment
   */
  public getDatabaseConfig(): DatabaseConfig {
    if (this.env.isProduction) {
      return {
        url: process.env.PRODUCTION_DB_URL || process.env.DATABASE_URL || '',
        ssl: true,
        connectionTimeout: 30000,
        poolSize: 20,
      };
    }

    // Development/Test environment
    return {
      url: process.env.DATABASE_URL || 'postgresql://localhost:5432/farmshare',
      ssl: false,
      connectionTimeout: 10000,
      poolSize: 5,
    };
  }

  /**
   * Get the database URL directly
   */
  public getDatabaseUrl(): string {
    return this.getDatabaseConfig().url;
  }

  /**
   * Get Paystack configuration based on environment
   */
  public getPaystackConfig(): PaystackConfig {
    const isTestMode =
      this.env.isDevelopment || process.env.PAYSTACK_TEST_MODE === 'true';

    if (this.env.isProduction && !isTestMode) {
      // Production mode - use live keys
      return {
        secretKey:
          process.env.PAYSTACK_LIVE_SECRET_KEY ||
          process.env.PAYSTACK_SECRET_KEY ||
          '',
        publicKey:
          process.env.PAYSTACK_LIVE_PUBLIC_KEY ||
          process.env.PAYSTACK_PUBLIC_KEY ||
          '',
        baseUrl: 'https://api.paystack.co',
        isTestMode: false,
      };
    }

    // Development/Test mode - use test keys
    return {
      secretKey:
        process.env.PAYSTACK_TEST_SECRET_KEY ||
        process.env.PAYSTACK_SECRET_KEY ||
        '',
      publicKey:
        process.env.PAYSTACK_TEST_PUBLIC_KEY ||
        process.env.PAYSTACK_PUBLIC_KEY ||
        '',
      baseUrl: 'https://api.paystack.co',
      isTestMode: true,
    };
  }

  /**
   * Get Stripe configuration based on environment
   */
  public getStripeConfig(): StripeConfig {
    const isTestMode =
      this.env.isDevelopment || process.env.STRIPE_TEST_MODE === 'true';

    if (this.env.isProduction && !isTestMode) {
      // Production mode - use live keys
      return {
        secretKey:
          process.env.STRIPE_LIVE_SECRET_KEY ||
          process.env.STRIPE_SECRET_KEY ||
          '',
        webhookSecret:
          process.env.STRIPE_LIVE_WEBHOOK_SECRET ||
          process.env.STRIPE_WEBHOOK_SECRET ||
          '',
        isTestMode: false,
      };
    }

    // Development/Test mode - use test keys
    return {
      secretKey:
        process.env.STRIPE_TEST_SECRET_KEY ||
        process.env.STRIPE_SECRET_KEY ||
        '',
      webhookSecret:
        process.env.STRIPE_TEST_WEBHOOK_SECRET ||
        process.env.STRIPE_WEBHOOK_SECRET ||
        '',
      isTestMode: true,
    };
  }

  /**
   * Get API URLs based on environment
   */
  public getApiConfig(): ApiConfig {
    if (this.env.isProduction) {
      const productionFrontendUrl =
        process.env.PRODUCTION_FRONTEND_URL || process.env.FRONTEND_URL || '';
      const productionBackendUrl = process.env.PRODUCTION_BACKEND_URL || '';

      return {
        frontendUrl: productionFrontendUrl,
        backendUrl: productionBackendUrl,
        allowedOrigins: [
          productionFrontendUrl,
          // Vercel frontend URL - hardcoded for reliability
          'https://farmshare-marketplace.vercel.app',
          // Add any additional production origins
        ].filter(Boolean),
      };
    }

    // Development environment
    const devFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const devBackendUrl = process.env.BACKEND_URL || 'http://localhost:8282';

    return {
      frontendUrl: devFrontendUrl,
      backendUrl: devBackendUrl,
      allowedOrigins: [
        devFrontendUrl,
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4040',
      ],
    };
  }

  /**
   * Get Redis configuration based on environment
   */
  public getRedisConfig(): {
    host: string;
    port: number;
    password?: string;
    tls?: boolean;
  } {
    if (this.env.isProduction) {
      return {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        tls: process.env.REDIS_TLS === 'true',
      };
    }

    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      tls: false,
    };
  }

  /**
   * Check if we should use secure cookies
   */
  public shouldUseSecureCookies(): boolean {
    return this.env.isProduction;
  }

  /**
   * Get CORS allowed origins
   */
  public getCorsOrigins(): string[] {
    return this.getApiConfig().allowedOrigins;
  }

  /**
   * Log current environment configuration (for debugging)
   * NEVER log sensitive data like secrets
   */
  public logConfig(): void {
    console.log('=== Environment Configuration ===');
    console.log(`NODE_ENV: ${this.env.nodeEnv}`);
    console.log(`Is Production: ${this.env.isProduction}`);
    console.log(`Database SSL: ${this.getDatabaseConfig().ssl}`);
    console.log(`Paystack Test Mode: ${this.getPaystackConfig().isTestMode}`);
    console.log(`Stripe Test Mode: ${this.getStripeConfig().isTestMode}`);
    console.log(`Frontend URL: ${this.getApiConfig().frontendUrl}`);
    console.log('================================');
  }
}

// Export singleton instance
export const envConfig = EnvironmentConfig.getInstance();
