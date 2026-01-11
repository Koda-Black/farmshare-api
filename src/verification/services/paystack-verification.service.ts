// src/verification/services/paystack-verification.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, retry, catchError } from 'rxjs';
import { AxiosError } from 'axios';

export interface BankVerificationResult {
  success: boolean;
  accountName?: string;
  accountNumber?: string;
  bankCode?: string;
  message?: string;
  error?: string;
  data?: any;
}

export interface Bank {
  id: number;
  name: string;
  slug: string;
  code: string;
  longcode: string;
  gateway: string;
  active: boolean;
}

@Injectable()
export class PaystackVerificationService {
  private readonly logger = new Logger(PaystackVerificationService.name);
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly secretKey: string;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.secretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') ?? '';

    if (!this.secretKey) {
      this.logger.warn(
        'PAYSTACK_SECRET_KEY not configured - Bank verification will not work',
      );
    }
  }

  /**
   * Verify a Nigerian bank account using Paystack's API
   * @param accountNumber - 10-digit Nigerian bank account number
   * @param bankCode - Paystack bank code (e.g., "058" for GTBank)
   * @returns BankVerificationResult with account name if successful
   */
  async verifyBankAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<BankVerificationResult> {
    if (!this.secretKey) {
      this.logger.error('Paystack API key not configured');
      return {
        success: false,
        error: 'Paystack API key not configured',
        message:
          'Bank verification service unavailable. Please contact support.',
      };
    }

    // Validate inputs
    if (!accountNumber || !bankCode) {
      throw new BadRequestException(
        'Account number and bank code are required',
      );
    }

    // Validate account number format (Nigerian banks use 10 digits)
    if (!/^\d{10}$/.test(accountNumber)) {
      throw new BadRequestException(
        'Invalid account number format. Must be 10 digits.',
      );
    }

    // Validate bank code format (3 digits typically)
    if (!/^\d{3,6}$/.test(bankCode)) {
      throw new BadRequestException('Invalid bank code format');
    }

    const url = `${this.baseUrl}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`;

    try {
      this.logger.log(
        `Verifying bank account: ${accountNumber} with bank code: ${bankCode}`,
      );

      const response = await firstValueFrom(
        this.httpService
          .get(url, {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 15000, // 15 seconds timeout
          })
          .pipe(
            retry({
              count: this.maxRetries,
              delay: (error, retryCount) => {
                this.logger.warn(
                  `Retry attempt ${retryCount} for bank verification`,
                );
                return new Promise((resolve) =>
                  setTimeout(resolve, this.retryDelay * retryCount),
                );
              },
            }),
            catchError((error: AxiosError) => {
              throw error;
            }),
          ),
      );

      if (response.data?.status && response.data?.data?.account_name) {
        const result = {
          success: true,
          accountName: response.data.data.account_name,
          accountNumber,
          bankCode,
          message: 'Bank account verified successfully',
          data: response.data.data,
        };

        this.logger.log(
          `Bank account verified successfully: ${result.accountName}`,
        );
        return result;
      } else {
        this.logger.warn('Invalid response structure from Paystack');
        return {
          success: false,
          error: 'Invalid response from Paystack',
          message: 'Could not verify bank account. Please try again.',
        };
      }
    } catch (error) {
      return this.handleVerificationError(error, accountNumber);
    }
  }

  /**
   * Handle errors from bank verification API calls
   */
  private handleVerificationError(
    error: any,
    accountNumber: string,
  ): BankVerificationResult {
    this.logger.error(
      `Bank verification failed for account ${accountNumber}: ${error.message}`,
      error.stack,
    );

    // Handle specific HTTP error codes
    if (error.response) {
      const status = error.response.status;
      const errorMessage =
        error.response.data?.message || 'Unknown error from Paystack';

      switch (status) {
        case 400:
          return {
            success: false,
            error: 'Bad request',
            message: errorMessage || 'Invalid request parameters',
          };
        case 401:
          this.logger.error('Paystack API authentication failed');
          return {
            success: false,
            error: 'Authentication failed',
            message: 'Bank verification service authentication error',
          };
        case 422:
          return {
            success: false,
            error: 'Invalid account',
            message:
              'Account number not found or invalid for the selected bank',
          };
        case 429:
          return {
            success: false,
            error: 'Rate limit exceeded',
            message: 'Too many requests. Please try again in a moment.',
          };
        case 500:
        case 502:
        case 503:
        case 504:
          return {
            success: false,
            error: 'Service unavailable',
            message:
              'Bank verification service temporarily unavailable. Please try again later.',
          };
        default:
          return {
            success: false,
            error: errorMessage,
            message: 'Bank verification failed. Please try again.',
          };
      }
    }

    // Handle network errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        success: false,
        error: 'Request timeout',
        message: 'Bank verification request timed out. Please try again.',
      };
    }

    // Generic error
    return {
      success: false,
      error: error.message || 'Unknown error',
      message: 'Bank verification service temporarily unavailable',
    };
  }

  /**
   * Get list of all supported Nigerian banks from Paystack
   * @returns Array of banks with their codes
   */
  async getSupportedBanks(): Promise<Bank[]> {
    if (!this.secretKey) {
      this.logger.warn('Cannot fetch banks - Paystack API key not configured');
      return [];
    }

    try {
      this.logger.log('Fetching list of supported banks from Paystack');

      const response = await firstValueFrom(
        this.httpService
          .get(`${this.baseUrl}/bank?country=nigeria`, {
            headers: { Authorization: `Bearer ${this.secretKey}` },
            timeout: 10000,
          })
          .pipe(
            retry({
              count: 2,
              delay: 1000,
            }),
          ),
      );

      const banks = response.data?.data || [];

      // Remove duplicates by bank code
      const uniqueBanks = banks.reduce((acc: Bank[], current: Bank) => {
        const exists = acc.find((bank) => bank.code === current.code);
        if (!exists) {
          acc.push(current);
        }
        return acc;
      }, []);

      this.logger.log(
        `Fetched ${uniqueBanks.length} unique banks from Paystack (removed ${banks.length - uniqueBanks.length} duplicates)`,
      );
      return uniqueBanks;

      //   this.logger.log(`Fetched ${banks.length} banks from Paystack`);
      //   return banks;
    } catch (error) {
      this.logger.error(`Failed to fetch banks: ${error.message}`);
      return [];
    }
  }

  /**
   * Health check to verify Paystack API is accessible
   * @returns boolean indicating if service is operational
   */
  async healthCheck(): Promise<boolean> {
    if (!this.secretKey) {
      return false;
    }

    try {
      const banks = await this.getSupportedBanks();
      return banks.length > 0;
    } catch (error) {
      this.logger.error('Paystack health check failed', error);
      return false;
    }
  }
}
