import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout, catchError, throwError } from 'rxjs';
import { AxiosError } from 'axios';

@Injectable()
export class PaystackService {
  private readonly secret: string;
  private readonly logger = new Logger(PaystackService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.secret = this.config.get<string>('PAYSTACK_SECRET_KEY')!;
  }

  async initialize(amount: number, metadata: any) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      this.logger.log(
        `Initializing Paystack payment for ${metadata.email}, amount: ${amount}`,
      );

      const observable = this.http.post(
        'https://api.paystack.co/transaction/initialize',
        {
          email: metadata.email,
          amount: amount * 100,
          metadata,
          callback_url: this.config.get<string>('PAYSTACK_CALLBACK_URL'),
        },
        {
          headers: { Authorization: `Bearer ${this.secret}` },
          timeout: 30000,
          signal: controller.signal,
        },
      );

      const res = await firstValueFrom(
        observable.pipe(
          timeout(30000),
          catchError((error) => {
            if (error.name === 'TimeoutError' || error.name === 'AbortError') {
              this.logger.error('Paystack initialization timeout');
              return throwError(
                () =>
                  new BadRequestException(
                    'Payment initialization timeout. Please try again.',
                  ),
              );
            }
            this.logger.error('Paystack initialization error:', error.message);
            return throwError(
              () => new BadRequestException('Payment initialization failed'),
            );
          }),
        ),
      );

      clearTimeout(timeoutId);

      if (!res?.data?.status) {
        this.logger.error('Paystack initialization failed: Invalid response');
        throw new BadRequestException('Paystack initialization failed');
      }

      this.logger.log(
        `Paystack payment initialized successfully. Reference: ${res.data.data.reference}`,
      );
      return res.data.data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error instanceof AxiosError) {
        this.logger.error(
          `Paystack API error: ${error.response?.status} - ${error.response?.data?.message || error.message}`,
        );
        throw new BadRequestException(
          `Paystack API error: ${error.response?.data?.message || 'Payment service unavailable'}`,
        );
      }

      this.logger.error(
        'Unexpected Paystack initialization error:',
        error.message,
      );
      throw new BadRequestException(
        'Payment initialization failed. Please try again.',
      );
    }
  }

  async verify(reference: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout for verification

    try {
      this.logger.log(
        `Verifying Paystack payment with reference: ${reference}`,
      );

      const observable = this.http.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: { Authorization: `Bearer ${this.secret}` },
          timeout: 15000,
          signal: controller.signal,
        },
      );

      const res = await firstValueFrom(
        observable.pipe(
          timeout(15000),
          catchError((error) => {
            if (error.name === 'TimeoutError' || error.name === 'AbortError') {
              this.logger.error(
                `Paystack verification timeout for reference: ${reference}`,
              );
              return throwError(
                () =>
                  new BadRequestException(
                    'Payment verification timeout. Please try again.',
                  ),
              );
            }
            this.logger.error(
              `Paystack verification error for reference ${reference}:`,
              error.message,
            );
            return throwError(
              () => new BadRequestException('Payment verification failed'),
            );
          }),
        ),
      );

      clearTimeout(timeoutId);

      if (!res?.data?.status) {
        this.logger.error(
          `Paystack verification failed for reference ${reference}: Invalid response`,
        );
        throw new BadRequestException('Paystack verification failed');
      }

      this.logger.log(
        `Paystack payment verified successfully. Status: ${res.data.data.status}, Amount: ${res.data.data.amount}`,
      );
      return res.data.data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error instanceof AxiosError) {
        this.logger.error(
          `Paystack verification API error for reference ${reference}: ${error.response?.status} - ${error.response?.data?.message || error.message}`,
        );
        throw new BadRequestException(
          `Payment verification error: ${error.response?.data?.message || 'Verification service unavailable'}`,
        );
      }

      this.logger.error(
        `Unexpected Paystack verification error for reference ${reference}:`,
        error.message,
      );
      throw new BadRequestException(
        'Payment verification failed. Please try again.',
      );
    }
  }

  // ============================================================================
  // BANK VERIFICATION & TRANSFER RECIPIENT APIs (for Escrow)
  // ============================================================================

  /**
   * Get list of all banks supported by Paystack
   */
  async getBanks(): Promise<any[]> {
    try {
      const observable = this.http.get('https://api.paystack.co/bank', {
        headers: { Authorization: `Bearer ${this.secret}` },
        timeout: 15000,
      });

      const res = await firstValueFrom(observable.pipe(timeout(15000)));

      if (!res?.data?.status) {
        throw new BadRequestException('Failed to fetch banks');
      }

      return res.data.data;
    } catch (error) {
      this.logger.error('Failed to fetch banks:', error.message);
      throw new BadRequestException('Failed to fetch banks');
    }
  }

  /**
   * Verify a bank account using Paystack
   */
  async verifyBankAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<{
    verified: boolean;
    accountName: string;
    accountNumber: string;
    bankCode: string;
  }> {
    try {
      this.logger.log(
        `Verifying bank account: ${accountNumber} at bank ${bankCode}`,
      );

      const observable = this.http.get(
        `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        {
          headers: { Authorization: `Bearer ${this.secret}` },
          timeout: 15000,
        },
      );

      const res = await firstValueFrom(observable.pipe(timeout(15000)));

      if (!res?.data?.status || !res?.data?.data?.account_name) {
        return { verified: false, accountName: '', accountNumber, bankCode };
      }

      this.logger.log(`Bank account verified: ${res.data.data.account_name}`);
      return {
        verified: true,
        accountName: res.data.data.account_name,
        accountNumber,
        bankCode,
      };
    } catch (error) {
      this.logger.error(
        `Bank verification failed for ${accountNumber}:`,
        error.message,
      );
      return { verified: false, accountName: '', accountNumber, bankCode };
    }
  }

  /**
   * Create a transfer recipient for a vendor
   * This must be done before transfers can be made
   */
  async createTransferRecipient(
    name: string,
    accountNumber: string,
    bankCode: string,
  ): Promise<{ recipientCode: string; details: any }> {
    try {
      this.logger.log(
        `Creating transfer recipient for: ${name}, account: ${accountNumber}`,
      );

      const observable = this.http.post(
        'https://api.paystack.co/transferrecipient',
        {
          type: 'nuban',
          name,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: 'NGN',
        },
        {
          headers: { Authorization: `Bearer ${this.secret}` },
          timeout: 15000,
        },
      );

      const res = await firstValueFrom(observable.pipe(timeout(15000)));

      if (!res?.data?.status || !res?.data?.data?.recipient_code) {
        throw new BadRequestException('Failed to create transfer recipient');
      }

      this.logger.log(
        `Transfer recipient created: ${res.data.data.recipient_code}`,
      );
      return {
        recipientCode: res.data.data.recipient_code,
        details: res.data.data,
      };
    } catch (error) {
      this.logger.error('Failed to create transfer recipient:', error.message);
      throw new BadRequestException(
        'Failed to setup vendor payout. Please verify bank details.',
      );
    }
  }

  /**
   * Initiate a transfer to a vendor (escrow release)
   * Amount is in Naira (will be converted to kobo)
   */
  async initiateTransfer(
    amount: number,
    recipientCode: string,
    reason: string,
    reference?: string,
  ): Promise<{
    transferCode: string;
    reference: string;
    status: string;
  }> {
    try {
      this.logger.log(`Initiating transfer of ₦${amount} to ${recipientCode}`);

      const observable = this.http.post(
        'https://api.paystack.co/transfer',
        {
          source: 'balance',
          amount: amount * 100, // Convert to kobo
          recipient: recipientCode,
          reason,
          reference:
            reference ||
            `TRF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        },
        {
          headers: { Authorization: `Bearer ${this.secret}` },
          timeout: 30000,
        },
      );

      const res = await firstValueFrom(observable.pipe(timeout(30000)));

      if (!res?.data?.status) {
        throw new BadRequestException('Transfer initiation failed');
      }

      this.logger.log(
        `Transfer initiated: ${res.data.data.transfer_code}, status: ${res.data.data.status}`,
      );
      return {
        transferCode: res.data.data.transfer_code,
        reference: res.data.data.reference,
        status: res.data.data.status,
      };
    } catch (error) {
      this.logger.error('Transfer initiation failed:', error.message);
      throw new BadRequestException('Failed to transfer funds to vendor');
    }
  }

  /**
   * Verify a transfer status
   */
  async verifyTransfer(reference: string): Promise<{
    status: string;
    amount: number;
    recipientCode: string;
  }> {
    try {
      const observable = this.http.get(
        `https://api.paystack.co/transfer/verify/${reference}`,
        {
          headers: { Authorization: `Bearer ${this.secret}` },
          timeout: 15000,
        },
      );

      const res = await firstValueFrom(observable.pipe(timeout(15000)));

      if (!res?.data?.status) {
        throw new BadRequestException('Transfer verification failed');
      }

      return {
        status: res.data.data.status,
        amount: res.data.data.amount / 100, // Convert back to Naira
        recipientCode: res.data.data.recipient.recipient_code,
      };
    } catch (error) {
      this.logger.error(
        `Transfer verification failed for ${reference}:`,
        error.message,
      );
      throw new BadRequestException('Failed to verify transfer status');
    }
  }

  /**
   * Get Paystack account balance (for monitoring)
   */
  async getBalance(): Promise<{ currency: string; balance: number }[]> {
    try {
      const observable = this.http.get('https://api.paystack.co/balance', {
        headers: { Authorization: `Bearer ${this.secret}` },
        timeout: 15000,
      });

      const res = await firstValueFrom(observable.pipe(timeout(15000)));

      if (!res?.data?.status) {
        throw new BadRequestException('Failed to fetch balance');
      }

      return res.data.data.map((b: any) => ({
        currency: b.currency,
        balance: b.balance / 100, // Convert to Naira
      }));
    } catch (error) {
      this.logger.error('Failed to fetch Paystack balance:', error.message);
      throw new BadRequestException('Failed to fetch platform balance');
    }
  }
}
