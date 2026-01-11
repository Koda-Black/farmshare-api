import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PaystackVerificationService, BankVerificationResult } from './paystack-verification.service';
import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';

describe('PaystackVerificationService', () => {
  let service: PaystackVerificationService;
  let httpService: HttpService;
  let configService: ConfigService;

  const mockHttpService = {
    get: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaystackVerificationService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PaystackVerificationService>(PaystackVerificationService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);

    // Setup default config values
    mockConfigService.get.mockReturnValue('sk_test_example_key');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyBankAccount', () => {
    const validAccountNumber = '0123456789';
    const validBankCode = '058';

    it('should verify bank account successfully', async () => {
      const mockResponse = {
        data: {
          status: true,
          data: {
            account_name: 'JOHN DOE',
            account_number: validAccountNumber,
            bank_id: 1,
            bank_name: 'Guaranty Trust Bank',
          },
        },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const result = await service.verifyBankAccount(validAccountNumber, validBankCode);

      expect(result.success).toBe(true);
      expect(result.accountName).toBe('JOHN DOE');
      expect(result.accountNumber).toBe(validAccountNumber);
      expect(result.bankCode).toBe(validBankCode);
      expect(result.message).toBe('Bank account verified successfully');
    });

    it('should return error when API key is not configured', async () => {
      mockConfigService.get.mockReturnValue('');

      const result = await service.verifyBankAccount(validAccountNumber, validBankCode);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Paystack API key not configured');
      expect(result.message).toContain('unavailable');
    });

    it('should validate account number format', async () => {
      await expect(
        service.verifyBankAccount('123', validBankCode),
      ).rejects.toThrow('Invalid account number format. Must be 10 digits.');

      await expect(
        service.verifyBankAccount('12345678901', validBankCode),
      ).rejects.toThrow('Invalid account number format. Must be 10 digits.');

      await expect(
        service.verifyBankAccount('abcdefghij', validBankCode),
      ).rejects.toThrow('Invalid account number format. Must be 10 digits.');
    });

    it('should validate bank code format', async () => {
      await expect(
        service.verifyBankAccount(validAccountNumber, ''),
      ).rejects.toThrow('Invalid bank code format');

      await expect(
        service.verifyBankAccount(validAccountNumber, 'ab'),
      ).rejects.toThrow('Invalid bank code format');
    });

    it('should validate required parameters', async () => {
      await expect(
        service.verifyBankAccount('', validBankCode),
      ).rejects.toThrow('Account number and bank code are required');

      await expect(
        service.verifyBankAccount(validAccountNumber, ''),
      ).rejects.toThrow('Account number and bank code are required');
    });

    it('should handle invalid account number response', async () => {
      const mockResponse = {
        data: {
          status: false,
          message: 'Account number not found',
        },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const result = await service.verifyBankAccount(validAccountNumber, validBankCode);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Could not verify bank account');
    });

    it('should handle 422 error (invalid account)', async () => {
      const error = new AxiosError();
      error.response = {
        status: 422,
        data: { message: 'Invalid account number' },
      } as any;

      mockHttpService.get.mockReturnValue(throwError(() => error));

      const result = await service.verifyBankAccount(validAccountNumber, validBankCode);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid account');
      expect(result.message).toContain('not found or invalid');
    }, 10000);

    it('should handle 401 error (authentication)', async () => {
      const error = new AxiosError();
      error.response = {
        status: 401,
        data: { message: 'Invalid API key' },
      } as any;

      mockHttpService.get.mockReturnValue(throwError(() => error));

      const result = await service.verifyBankAccount(validAccountNumber, validBankCode);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication failed');
      expect(result.message).toContain('authentication error');
    }, 10000);

    it('should handle 429 error (rate limit)', async () => {
      const error = new AxiosError();
      error.response = {
        status: 429,
        data: { message: 'Rate limit exceeded' },
      } as any;

      mockHttpService.get.mockReturnValue(throwError(() => error));

      const result = await service.verifyBankAccount(validAccountNumber, validBankCode);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
      expect(result.message).toContain('try again in a moment');
    }, 10000);

    it('should handle 500 error (server error)', async () => {
      const error = new AxiosError();
      error.response = {
        status: 500,
        data: { message: 'Internal server error' },
      } as any;

      mockHttpService.get.mockReturnValue(throwError(() => error));

      const result = await service.verifyBankAccount(validAccountNumber, validBankCode);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Service unavailable');
      expect(result.message).toContain('temporarily unavailable');
    }, 10000);

    it('should handle network timeout', async () => {
      const error = new AxiosError();
      error.code = 'ECONNABORTED';

      mockHttpService.get.mockReturnValue(throwError(() => error));

      const result = await service.verifyBankAccount(validAccountNumber, validBankCode);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Request timeout');
      expect(result.message).toContain('request timed out');
    }, 10000);

    it('should retry on temporary failures', async () => {
      let attemptCount = 0;
      const mockResponse = {
        data: {
          status: true,
          data: {
            account_name: 'JOHN DOE',
            account_number: validAccountNumber,
          },
        },
      };

      mockHttpService.get.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 2) {
          const error = new AxiosError();
          error.code = 'ECONNRESET';
          return throwError(() => error);
        }
        return of(mockResponse);
      });

      const result = await service.verifyBankAccount(validAccountNumber, validBankCode);

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(2);
    }, 10000);

    it('should handle malformed response', async () => {
      const mockResponse = {
        data: {
          status: true,
          // Missing data object
        },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const result = await service.verifyBankAccount(validAccountNumber, validBankCode);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid response from Paystack');
    });
  });

  describe('getSupportedBanks', () => {
    it('should return list of supported banks', async () => {
      const mockBanks = [
        {
          id: 1,
          name: 'Guaranty Trust Bank',
          slug: 'guaranty-trust-bank',
          code: '058',
          longcode: '058',
          gateway: 'mix',
          active: true,
        },
        {
          id: 2,
          name: 'Access Bank',
          slug: 'access-bank',
          code: '044',
          longcode: '044',
          gateway: 'mix',
          active: true,
        },
        {
          id: 1,
          name: 'Guaranty Trust Bank', // Duplicate with same code
          slug: 'guaranty-trust-bank-dup',
          code: '058',
          longcode: '058',
          gateway: 'mix',
          active: true,
        },
      ];

      const mockResponse = {
        data: {
          data: mockBanks,
        },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const result = await service.getSupportedBanks();

      expect(result).toHaveLength(2); // Should remove duplicate by bank code
      expect(result[0].code).toBe('058');
      expect(result[1].code).toBe('044');
    });

    it('should return empty array when API key is not configured', async () => {
      mockConfigService.get.mockReturnValue('');

      const result = await service.getSupportedBanks();

      expect(result).toHaveLength(0);
    });

    it('should handle API errors gracefully', async () => {
      const error = new AxiosError();
      error.response = {
        status: 500,
        data: { message: 'Server error' },
      } as any;

      mockHttpService.get.mockReturnValue(throwError(() => error));

      const result = await service.getSupportedBanks();

      expect(result).toHaveLength(0);
    });

    it('should retry on temporary failures', async () => {
      let attemptCount = 0;
      const mockResponse = {
        data: {
          data: [
            {
              id: 1,
              name: 'Test Bank',
              code: '001',
              active: true,
            },
          ],
        },
      };

      mockHttpService.get.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 2) {
          return throwError(() => new Error('Network error'));
        }
        return of(mockResponse);
      });

      const result = await service.getSupportedBanks();

      expect(result).toHaveLength(1);
      expect(attemptCount).toBe(2);
    });
  });

  describe('healthCheck', () => {
    it('should return false when API key is not configured', async () => {
      mockConfigService.get.mockReturnValue('');

      const result = await service.healthCheck();

      expect(result).toBe(false);
    });

    it('should return true when API is accessible', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 1,
              name: 'Test Bank',
              code: '001',
              active: true,
            },
          ],
        },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const result = await service.healthCheck();

      expect(result).toBe(true);
    });

    it('should return false when API is not accessible', async () => {
      const error = new AxiosError();
      error.response = {
        status: 500,
        data: { message: 'Server error' },
      } as any;

      mockHttpService.get.mockReturnValue(throwError(() => error));

      const result = await service.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('error handling edge cases', () => {
    it('should handle malformed error responses', async () => {
      const error = new AxiosError();
      error.response = {
        status: 400,
        data: null, // No error message
      } as any;

      mockHttpService.get.mockReturnValue(throwError(() => error));

      const result = await service.verifyBankAccount('0123456789', '058');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Bad request');
      expect(result.message).toBe('Invalid request parameters');
    }, 10000);

    it('should handle error without response object', async () => {
      const error = new Error('Network error');

      mockHttpService.get.mockReturnValue(throwError(() => error));

      const result = await service.verifyBankAccount('0123456789', '058');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      expect(result.message).toBe('Bank verification service temporarily unavailable');
    }, 10000);

    it('should handle specific bank codes', async () => {
      const mockResponse = {
        data: {
          status: true,
          data: {
            account_name: 'TEST USER',
            account_number: '0123456789',
          },
        },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const result = await service.verifyBankAccount('0123456789', '057'); // Zenith Bank

      expect(result.success).toBe(true);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('bank_code=057'),
        expect.any(Object),
      );
    });

    it('should validate account number with leading zeros', async () => {
      const accountWithLeadingZeros = '0012345678';
      const mockResponse = {
        data: {
          status: true,
          data: {
            account_name: 'TEST USER',
            account_number: accountWithLeadingZeros,
          },
        },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const result = await service.verifyBankAccount(accountWithLeadingZeros, '058');

      expect(result.success).toBe(true);
      expect(result.accountNumber).toBe(accountWithLeadingZeros);
    });
  });
});