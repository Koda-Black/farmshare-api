import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { FaceVerificationService } from './face-verification.service';

describe('FaceVerificationService', () => {
  let service: FaceVerificationService;
  let httpService: HttpService;
  let configService: ConfigService;

  const mockHttpService = {
    post: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaceVerificationService,
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

    service = module.get<FaceVerificationService>(FaceVerificationService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);

    // Setup default config values
    mockConfigService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'FACEPP_API_KEY':
          return 'test-api-key';
        case 'FACEPP_API_SECRET':
          return 'test-api-secret';
        default:
          return null;
      }
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyFace', () => {
    const validSelfieImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ';
    const validIdCardImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ';

    it('should verify face successfully with valid images', async () => {
      // Mock successful face detection
      mockHttpService.post.mockImplementation((url) => {
        if (url.includes('/detect')) {
          return Promise.resolve({
            data: {
              faces: [
                {
                  face_token: 'face-token-1',
                  face_rectangle: { width: 100, height: 120, left: 50, top: 40 },
                },
              ],
            },
          });
        }
        if (url.includes('/compare')) {
          return Promise.resolve({
            data: {
              confidence: 85.5,
              request_id: 'req-123',
              time_used: 500,
            },
          });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      const result = await service.verifyFace(
        validSelfieImage,
        validIdCardImage,
        70,
      );

      expect(result.success).toBe(true);
      expect(result.confidence).toBe(85.5);
      expect(result.facesDetected).toBe(2);
      expect(result.message).toContain('faces match');
    });

    it('should return error when API credentials are not configured', async () => {
      mockConfigService.get.mockReturnValue(null);

      const result = await service.verifyFace(
        validSelfieImage,
        validIdCardImage,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Face++ API not configured');
      expect(result.message).toContain('unavailable');
    });

    it('should handle face detection failure', async () => {
      // Mock no faces detected
      mockHttpService.post.mockResolvedValue({
        data: { faces: [] },
      });

      const result = await service.verifyFace(
        validSelfieImage,
        validIdCardImage,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('No face detected in selfie');
    });

    it('should handle multiple faces detected in selfie', async () => {
      // Mock multiple faces in selfie
      mockHttpService.post.mockImplementation((url) => {
        if (url.includes('/detect')) {
          return Promise.resolve({
            data: {
              faces: [
                { face_token: 'face-1' },
                { face_token: 'face-2' },
              ],
            },
          });
        }
        return Promise.resolve({ data: { faces: [{ face_token: 'id-face' }] } });
      });

      const result = await service.verifyFace(
        validSelfieImage,
        validIdCardImage,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Multiple faces detected in selfie');
    });

    it('should use mock comparison when real API fails', async () => {
      // Mock successful face detection
      mockHttpService.post.mockImplementation((url) => {
        if (url.includes('/detect')) {
          return Promise.resolve({
            data: {
              faces: [{ face_token: 'face-1' }],
            },
          });
        }
        if (url.includes('/compare')) {
          // Simulate API failure
          return Promise.reject(new Error('API limit exceeded'));
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      const result = await service.verifyFace(
        validSelfieImage,
        validIdCardImage,
        70,
      );

      expect(result.success).toBeDefined();
      expect(result.confidence).toBeDefined();
      // Mock should return confidence between 50-95
      expect(result.confidence).toBeGreaterThanOrEqual(50);
      expect(result.confidence).toBeLessThanOrEqual(95);
    });

    it('should reject invalid base64 images', async () => {
      const invalidImage = 'not-a-base64-image';

      await expect(
        service.verifyFace(invalidImage, validIdCardImage),
      ).rejects.toThrow('Invalid image format. Expected base64.');
    });

    it('should handle missing images', async () => {
      await expect(
        service.verifyFace('', validIdCardImage),
      ).rejects.toThrow('Both selfie and ID card images are required');
    });

    it('should retry on temporary failures', async () => {
      let attemptCount = 0;
      mockHttpService.post.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 2) {
          return Promise.reject(new Error('Temporary network error'));
        }
        return Promise.resolve({
          data: {
            faces: [{ face_token: 'face-1' }],
          },
        });
      });

      // Mock successful compare after retry
      mockHttpService.post.mockResolvedValueOnce({
        data: {
          confidence: 80,
          request_id: 'req-123',
          time_used: 500,
        },
      });

      const result = await service.verifyFace(
        validSelfieImage,
        validIdCardImage,
      );

      expect(result.success).toBe(true);
      expect(attemptCount).toBeGreaterThan(1);
    });
  });

  describe('validateBase64', () => {
    it('should validate correct base64 strings', () => {
      const validBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      expect(service['isValidBase64'](validBase64)).toBe(true);
    });

    it('should validate base64 with data URI prefix', () => {
      const validBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      expect(service['isValidBase64'](validBase64)).toBe(true);
    });

    it('should reject invalid base64 strings', () => {
      const invalidBase64 = 'not-base64!!!';
      expect(service['isValidBase64'](invalidBase64)).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(service['isValidBase64']('')).toBe(false);
      expect(service['isValidBase64'](null as any)).toBe(false);
      expect(service['isValidBase64'](undefined as any)).toBe(false);
    });
  });

  describe('healthCheck', () => {
    it('should return false when API credentials are missing', async () => {
      mockConfigService.get.mockReturnValue(null);

      const result = await service.healthCheck();
      expect(result).toBe(false);
    });

    it('should return true when API is accessible', async () => {
      // Mock successful face detection for health check
      mockHttpService.post.mockResolvedValue({
        data: {
          faces: [{ face_token: 'test-face' }],
        },
      });

      const result = await service.healthCheck();
      expect(result).toBe(true);
    });

    it('should return false when API is not accessible', async () => {
      // Mock API failure
      mockHttpService.post.mockRejectedValue(new Error('API unavailable'));

      const result = await service.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('validateFaceDetections', () => {
    it('should validate correct face detections', () => {
      const selfieFaces = [{ face_token: 'selfie-1' }];
      const idCardFaces = [{ face_token: 'id-1' }];

      const result = service['validateFaceDetections'](selfieFaces, idCardFaces);
      expect(result.success).toBe(true);
    });

    it('should detect no faces in selfie', () => {
      const selfieFaces: any[] = [];
      const idCardFaces = [{ face_token: 'id-1' }];

      const result = service['validateFaceDetections'](selfieFaces, idCardFaces);
      expect(result.success).toBe(false);
      expect(result.error).toBe('No face detected in selfie');
    });

    it('should detect no faces in ID card', () => {
      const selfieFaces = [{ face_token: 'selfie-1' }];
      const idCardFaces: any[] = [];

      const result = service['validateFaceDetections'](selfieFaces, idCardFaces);
      expect(result.success).toBe(false);
      expect(result.error).toBe('No face detected in ID card');
    });

    it('should detect multiple faces in selfie', () => {
      const selfieFaces = [{ face_token: 'selfie-1' }, { face_token: 'selfie-2' }];
      const idCardFaces = [{ face_token: 'id-1' }];

      const result = service['validateFaceDetections'](selfieFaces, idCardFaces);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Multiple faces detected in selfie');
    });
  });

  describe('handleFaceVerificationError', () => {
    it('should handle invalid image error', () => {
      const error = new Error('INVALID_IMAGE');
      const result = service['handleFaceVerificationError'](error);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid image');
      expect(result.message).toContain('clear JPEG or PNG image');
    });

    it('should handle image too large error', () => {
      const error = new Error('IMAGE_FILE_TOO_LARGE');
      const result = service['handleFaceVerificationError'](error);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Image too large');
      expect(result.message).toContain('smaller than 2MB');
    });

    it('should handle rate limit error', () => {
      const error = new Error('CONCURRENCY_LIMIT_EXCEEDED');
      const result = service['handleFaceVerificationError'](error);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Service busy');
      expect(result.message).toContain('try again in a moment');
    });

    it('should handle authentication error', () => {
      const error = new Error('AUTHENTICATION_ERROR');
      const result = service['handleFaceVerificationError'](error);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication failed');
      expect(result.message).toContain('contact support');
    });

    it('should handle generic errors', () => {
      const error = new Error('Some unknown error');
      const result = service['handleFaceVerificationError'](error);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Some unknown error');
      expect(result.message).toContain('temporarily unavailable');
    });

    it('should handle null error', () => {
      const result = service['handleFaceVerificationError'](null);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error occurred');
    });
  });

  describe('mockCompareFaces', () => {
    it('should generate confidence within expected range', async () => {
      const result = await service['mockCompareFaces']('token1', 'token2');

      expect(result.confidence).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(50);
      expect(result.confidence).toBeLessThanOrEqual(95);
      expect(result.request_id).toContain('mock_');
      expect(result.time_used).toBe(500);
    });

    it('should simulate API delay', async () => {
      const startTime = Date.now();
      await service['mockCompareFaces']('token1', 'token2');
      const endTime = Date.now();

      // Should take approximately 500ms
      expect(endTime - startTime).toBeGreaterThanOrEqual(450);
      expect(endTime - startTime).toBeLessThan(600);
    });
  });
});