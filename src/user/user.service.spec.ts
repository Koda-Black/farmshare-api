import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../services/prisma.service';
// Mock email service - doesn't exist yet but is referenced in UserService
const mockEmailService = {
  send: jest.fn(),
};

describe('UserService', () => {
  let service: UserService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as jest.Mocked<PrismaService>;

  const email = mockEmailService;

  const cloudinary = {} as any;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'CLOUDINARY', useValue: cloudinary },
        { provide: 'EmailService', useValue: email },
      ],
    }).compile();

    service = module.get(UserService);
  });

  it('gets profile', async () => {
    prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u' });
    const result = await service.getProfile('u');
    expect(result).toEqual({ id: 'u' });
  });

  it('updates profile', async () => {
    prisma.user.update = jest.fn().mockResolvedValue({ id: 'u', name: 'n' });
    const result = await service.updateProfile('u', { name: 'n' } as any);
    expect(result).toEqual({ id: 'u', name: 'n' });
  });
});
