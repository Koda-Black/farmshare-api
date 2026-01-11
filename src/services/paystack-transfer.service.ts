import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface CreateTransferRecipientDto {
  type: 'nuban' | 'mobile_money' | 'authorization';
  name: string;
  account_number: string;
  bank_code: string;
  currency?: string;
}

export interface TransferRecipient {
  id: string;
  type: string;
  name: string;
  account_number: string;
  bank_code: string;
  bank_name: string;
  currency: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InitiateTransferDto {
  source: 'balance';
  amount: number;
  recipient: string;
  reason?: string;
  currency?: string;
  reference?: string;
}

export interface TransferResponse {
  id: string;
  domain: string;
  status: 'success' | 'failed' | 'pending';
  reference: string;
  amount: number;
  recipient: {
    recipient_code: string;
    name: string;
    description: string;
    bank_details: {
      bank_name: string;
      bank_code: string;
      account_number: string;
      account_name: string;
    };
  };
  reason: string;
  createdAt: string;
  paidAt?: string;
}

@Injectable()
export class PaystackTransferService {
  private readonly logger = new Logger(PaystackTransferService.name);
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly secretKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
    if (!this.secretKey) {
      throw new Error('PAYSTACK_SECRET_KEY is required');
    }
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Create or update a transfer recipient for vendor payouts
   */
  async createTransferRecipient(
    dto: CreateTransferRecipientDto,
  ): Promise<TransferRecipient> {
    try {
      this.logger.log(`Creating transfer recipient for ${dto.name}`);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transferrecipient`,
          {
            type: dto.type,
            name: dto.name,
            account_number: dto.account_number,
            bank_code: dto.bank_code,
            currency: dto.currency || 'NGN',
          },
          { headers: this.getHeaders() },
        ),
      );

      this.logger.log(`Transfer recipient created: ${response.data.data.id}`);
      return response.data.data;
    } catch (error) {
      this.logger.error(
        `Failed to create transfer recipient: ${error.response?.data?.message || error.message}`,
        error.stack,
      );
      throw new Error(`Failed to create transfer recipient: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Initiate transfer to vendor's bank account
   */
  async initiateTransfer(
    dto: InitiateTransferDto,
  ): Promise<TransferResponse> {
    try {
      this.logger.log(`Initiating transfer of ₦${dto.amount} to recipient ${dto.recipient}`);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transfer`,
          {
            source: dto.source || 'balance',
            amount: dto.amount, // Amount in kobo (multiply by 100 for NGN)
            recipient: dto.recipient,
            reason: dto.reason || 'FarmShare Escrow Release',
            currency: dto.currency || 'NGN',
            reference: dto.reference,
          },
          { headers: this.getHeaders() },
        ),
      );

      this.logger.log(`Transfer initiated successfully: ${response.data.data.id}`);
      return response.data.data;
    } catch (error) {
      this.logger.error(
        `Failed to initiate transfer: ${error.response?.data?.message || error.message}`,
        error.stack,
      );
      throw new Error(`Failed to initiate transfer: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Verify transfer status
   */
  async verifyTransfer(reference: string): Promise<TransferResponse> {
    try {
      this.logger.log(`Verifying transfer: ${reference}`);

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/transfer/verify/${reference}`,
          { headers: this.getHeaders() },
        ),
      );

      return response.data.data;
    } catch (error) {
      this.logger.error(
        `Failed to verify transfer: ${error.response?.data?.message || error.message}`,
        error.stack,
      );
      throw new Error(`Failed to verify transfer: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Fetch transfer recipients
   */
  async fetchTransferRecipients(): Promise<TransferRecipient[]> {
    try {
      this.logger.log('Fetching transfer recipients');

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/transferrecipient`,
          { headers: this.getHeaders() },
        ),
      );

      return response.data.data;
    } catch (error) {
      this.logger.error(
        `Failed to fetch transfer recipients: ${error.response?.data?.message || error.message}`,
        error.stack,
      );
      throw new Error(`Failed to fetch transfer recipients: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get list of Nigerian banks for bank code selection
   */
  async getBanks(): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/bank?currency=NGN`,
          { headers: this.getHeaders() },
        ),
      );

      return response.data.data;
    } catch (error) {
      this.logger.error(
        `Failed to fetch banks: ${error.response?.data?.message || error.message}`,
        error.stack,
      );
      throw new Error(`Failed to fetch banks: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Resolve account number to get bank details
   */
  async resolveAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<{ account_number: string; account_name: string; bank_id: number }> {
    try {
      this.logger.log(`Resolving account ${accountNumber} for bank ${bankCode}`);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/bank/resolve`,
          {
            account_number: accountNumber,
            bank_code: bankCode,
          },
          { headers: this.getHeaders() },
        ),
      );

      return response.data.data;
    } catch (error) {
      this.logger.error(
        `Failed to resolve account: ${error.response?.data?.message || error.message}`,
        error.stack,
      );
      throw new Error(`Failed to resolve account: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Generate unique transfer reference
   */
  generateTransferReference(poolId: string, vendorId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `fs_${poolId.slice(0, 8)}_${vendorId.slice(0, 8)}_${timestamp}_${random}`;
  }
}