// src/verification/services/cac-verification.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, retry } from 'rxjs';
import * as cheerio from 'cheerio';

export interface CacVerificationResult {
  success: boolean;
  companyName?: string;
  registrationNumber?: string;
  registrationDate?: string;
  businessType?: string;
  status?: string;
  address?: string;
  city?: string;
  state?: string;
  message?: string;
  error?: string;
  data?: any;
}

@Injectable()
export class CacVerificationService {
  private readonly logger = new Logger(CacVerificationService.name);
  private readonly cacSearchUrl = 'https://search.cac.gov.ng';
  private readonly maxRetries = 2;

  constructor(private readonly httpService: HttpService) {}

  /**
   * Verify a Nigerian business registration using CAC public search portal
   * @param registrationNumber - CAC RC or BN number
   * @param companyName - Optional company name for additional verification
   * @returns CacVerificationResult with business details
   */
  async verifyBusinessRegistration(
    registrationNumber: string,
    companyName?: string,
  ): Promise<CacVerificationResult> {
    if (!registrationNumber) {
      throw new BadRequestException('Registration number is required');
    }

    // Normalize registration number (remove spaces, convert to uppercase)
    const normalizedRegNumber = registrationNumber.trim().toUpperCase();

    if (!this.isValidRegistrationNumber(normalizedRegNumber)) {
      return {
        success: false,
        error: 'Invalid registration number format',
        message:
          'Please provide a valid CAC registration number (Format: RC123456 or BN1234567890)',
      };
    }

    try {
      this.logger.log(
        `Verifying business registration: ${normalizedRegNumber}`,
      );

      // Attempt to scrape CAC public search portal
      const result = await this.scrapeCACPublicSearch(
        normalizedRegNumber,
        companyName,
      );

      if (result.success) {
        this.logger.log(
          `Business verification successful: ${result.companyName}`,
        );
        return result;
      }

      return {
        success: false,
        error: 'Business not found',
        message: 'Registration number not found in CAC public database',
      };
    } catch (error) {
      return this.handleCacVerificationError(error, normalizedRegNumber);
    }
  }

  /**
   * Validate Nigerian CAC registration number format
   * RC: Limited Liability Company (RC + 6-8 digits)
   * BN: Business Name (BN + 9-11 digits)
   * IT: Incorporated Trustees (IT + 6-8 digits)
   */
  private isValidRegistrationNumber(regNumber: string): boolean {
    const rcPattern = /^RC\d{6,8}$/i; // Limited Liability Company
    const bnPattern = /^BN\d{7,11}$/i; // Business Name
    const itPattern = /^IT\d{6,8}$/i; // Incorporated Trustees (NGOs, etc.)

    return (
      rcPattern.test(regNumber) ||
      bnPattern.test(regNumber) ||
      itPattern.test(regNumber)
    );
  }

  /**
   * Scrape CAC public search portal for business information
   * Note: This is a basic implementation. The actual CAC portal may require:
   * - Session cookies
   * - CAPTCHA solving
   * - Form submissions with CSRF tokens
   * - Rate limiting handling
   *
   * Consider using an official CAC API if/when available, or a third-party service
   * like Mono, Okra, or Dojah for production use.
   */
  private async scrapeCACPublicSearch(
    registrationNumber: string,
    companyName?: string,
  ): Promise<CacVerificationResult> {
    try {
      // IMPORTANT: The CAC public search portal structure may change
      // This is a simplified implementation for demonstration
      // In production, consider using:
      // 1. Official CAC API (when available)
      // 2. Third-party verification services (Mono, Okra, Dojah, Smile Identity)
      // 3. More robust scraping with Puppeteer for JavaScript-rendered content

      this.logger.log(
        `Attempting to fetch CAC data for ${registrationNumber}...`,
      );

      // For now, return mock data with warning
      // TODO: Implement actual CAC portal scraping or API integration
      this.logger.warn(
        'Using mock CAC verification - implement actual CAC portal integration for production',
      );

      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Mock successful verification
      const mockData: CacVerificationResult = {
        success: true,
        companyName:
          companyName || this.generateMockCompanyName(registrationNumber),
        registrationNumber,
        registrationDate: this.generateMockRegistrationDate(),
        businessType: this.getBusinessType(registrationNumber),
        status: 'ACTIVE',
        address: '123 Business District',
        city: 'Lagos',
        state: 'Lagos',
        message: 'Business registration verified successfully (MOCK DATA)',
        data: {
          note: 'This is mock data. Implement actual CAC integration for production.',
        },
      };

      return mockData;
    } catch (error) {
      this.logger.error(`CAC scraping failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse HTML response from CAC portal (to be implemented with actual portal structure)
   */
  private parseCACResponse(html: string): Partial<CacVerificationResult> {
    try {
      const $ = cheerio.load(html);

      // These selectors would need to match the actual CAC portal structure
      // This is placeholder code
      const companyName = $('.company-name').text().trim();
      const registrationDate = $('.registration-date').text().trim();
      const businessType = $('.business-type').text().trim();
      const status = $('.status').text().trim();

      return {
        companyName,
        registrationDate,
        businessType,
        status,
      };
    } catch (error) {
      this.logger.error('Failed to parse CAC response', error);
      return {};
    }
  }

  /**
   * Determine business type from registration number prefix
   */
  private getBusinessType(regNumber: string): string {
    if (regNumber.startsWith('RC')) {
      return 'LIMITED LIABILITY COMPANY';
    }
    if (regNumber.startsWith('BN')) {
      return 'BUSINESS NAME';
    }
    if (regNumber.startsWith('IT')) {
      return 'INCORPORATED TRUSTEES';
    }
    return 'UNKNOWN';
  }

  /**
   * Generate mock company name for testing
   */
  private generateMockCompanyName(regNumber: string): string {
    const types = ['ENTERPRISES', 'LIMITED', 'VENTURES', 'HOLDINGS', 'GROUP'];
    const randomType = types[Math.floor(Math.random() * types.length)];
    return `MOCK COMPANY ${regNumber} ${randomType}`;
  }

  /**
   * Generate mock registration date
   */
  private generateMockRegistrationDate(): string {
    const year = 2015 + Math.floor(Math.random() * 9); // 2015-2023
    const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
    const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Handle CAC verification errors
   */
  private handleCacVerificationError(
    error: any,
    registrationNumber: string,
  ): CacVerificationResult {
    this.logger.error(
      `CAC verification failed for ${registrationNumber}: ${error.message}`,
      error.stack,
    );

    if (error.response) {
      const status = error.response.status;

      if (status === 404) {
        return {
          success: false,
          error: 'Business not found',
          message:
            'The registration number was not found in the CAC database',
        };
      }

      if (status === 429) {
        return {
          success: false,
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.',
        };
      }

      if (status >= 500) {
        return {
          success: false,
          error: 'Service unavailable',
          message: 'CAC verification service is temporarily unavailable',
        };
      }
    }

    // Handle network errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        success: false,
        error: 'Request timeout',
        message: 'CAC verification request timed out. Please try again.',
      };
    }

    return {
      success: false,
      error: error.message || 'Unknown error',
      message: 'CAC verification service temporarily unavailable',
    };
  }

  /**
   * Health check for CAC verification service
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple connectivity check
      await firstValueFrom(
        this.httpService.get(this.cacSearchUrl, {
          timeout: 5000,
        }),
      );
      return true;
    } catch (error) {
      this.logger.error('CAC service health check failed', error);
      return false;
    }
  }
}
