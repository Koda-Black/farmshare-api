import { Test, TestingModule } from '@nestjs/testing';
import { EscrowService } from './escrow.service';
import { PrismaService } from '../services/prisma.service';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { TransactionType, TransactionStatus, PoolStatus } from '@prisma/client';

describe('EscrowService', () => {
  let service: EscrowService;
  let prismaService: PrismaService;
  let emailChannel: EmailChannelService;

  const mockPrismaService = {
    subscription: {
      findUnique: jest.fn(),
    },
    escrowEntry: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    pool: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    dispute: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockEmailChannel = {
    send: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscrowService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EmailChannelService,
          useValue: mockEmailChannel,
        },
      ],
    }).compile();

    service = module.get<EscrowService>(EscrowService);
    prismaService = module.get<PrismaService>(PrismaService);
    emailChannel = module.get<EmailChannelService>(EmailChannelService);

    // Reset all mocks
    Object.values(mockPrismaService).forEach((service: any) => {
      if (service && typeof service.mockReset === 'function') {
        service.mockReset();
      }
    });
    mockEmailChannel.send.mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createEscrowEntry', () => {
    const mockSubscription = {
      id: 'sub-1',
      userId: 'user-1',
      poolId: 'pool-1',
      amountPaid: 10000,
      slots: 2,
      pool: {
        id: 'pool-1',
        vendorId: 'vendor-1',
      },
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
    };

    it('should create new escrow entry successfully', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValue(mockSubscription);
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(null);

      const mockEscrow = {
        id: 'escrow-1',
        poolId: 'pool-1',
        totalHeld: 10000,
        releasedAmount: 0,
        withheldAmount: 0,
        computations: {
          contributions: {
            [mockSubscription.userId]: 10000,
          },
        },
      };

      mockPrismaService.escrowEntry.create.mockResolvedValue(mockEscrow);
      mockPrismaService.transaction.create.mockResolvedValue({ id: 'txn-1' });

      const result = await service.createEscrowEntry('pool-1', 'sub-1');

      expect(result).toEqual(mockEscrow);
      expect(mockPrismaService.escrowEntry.create).toHaveBeenCalledWith({
        data: {
          poolId: 'pool-1',
          totalHeld: 10000,
          computations: {
            contributions: {
              [mockSubscription.userId]: 10000,
            },
          },
        },
      });
      expect(mockPrismaService.transaction.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          poolId: 'pool-1',
          amount: 10000,
          fees: 0,
          status: TransactionStatus.SUCCESS,
          type: TransactionType.ESCROW_HOLD,
          externalTxnId: undefined,
          metadata: {
            subscriptionId: 'sub-1',
            slots: 2,
          },
        },
      });
    });

    it('should update existing escrow entry', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValue(mockSubscription);

      const existingEscrow = {
        id: 'escrow-1',
        poolId: 'pool-1',
        totalHeld: 8000,
        releasedAmount: 0,
        withheldAmount: 0,
        computations: {
          contributions: {
            [mockSubscription.userId]: 8000,
          },
        },
      };

      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(existingEscrow);
      mockPrismaService.escrowEntry.update.mockResolvedValue({
        ...existingEscrow,
        totalHeld: 18000,
        computations: {
          contributions: {
            [mockSubscription.userId]: 18000,
          },
        },
      });
      mockPrismaService.transaction.create.mockResolvedValue({ id: 'txn-1' });

      const result = await service.createEscrowEntry('pool-1', 'sub-1');

      expect(mockPrismaService.escrowEntry.update).toHaveBeenCalledWith({
        where: { id: 'escrow-1' },
        data: {
          totalHeld: 18000,
          computations: {
            contributions: {
              [mockSubscription.userId]: 18000,
            },
          },
        },
      });
    });

    it('should throw NotFoundException if subscription not found', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValue(null);

      await expect(service.createEscrowEntry('pool-1', 'sub-1')).rejects.toThrow(
        'Subscription not found',
      );
    });
  });

  describe('getEscrowDetails', () => {
    const mockEscrow = {
      id: 'escrow-1',
      poolId: 'pool-1',
      totalHeld: 10000,
      releasedAmount: 0,
      withheldAmount: 0,
      withheldReason: null,
      computations: {},
      pool: {
        id: 'pool-1',
        vendorId: 'vendor-1',
        vendor: {
          id: 'vendor-1',
          name: 'Test Vendor',
          email: 'vendor@example.com',
        },
        subscriptions: [
          {
            user: {
              id: 'user-1',
              name: 'Test User',
              email: 'user@example.com',
            },
          },
        ],
      },
    };

    it('should return escrow details with calculations', async () => {
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(mockEscrow);

      const result = await service.getEscrowDetails('pool-1');

      expect(result.escrow).toEqual({
        id: 'escrow-1',
        poolId: 'pool-1',
        totalHeld: 10000,
        releasedAmount: 0,
        withheldAmount: 0,
        withheldReason: null,
        computations: {},
      });
      expect(result.calculations).toEqual({
        commission: 500, // 5% of 10000
        netForVendor: 9500, // 10000 - 500
        commissionRate: 0.05,
      });
      expect(result.pool).toEqual(mockEscrow.pool);
    });

    it('should throw NotFoundException if escrow not found', async () => {
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(null);

      await expect(service.getEscrowDetails('pool-1')).rejects.toThrow(
        'Escrow entry not found',
      );
    });
  });

  describe('releaseEscrow', () => {
    const mockPool = {
      id: 'pool-1',
      status: PoolStatus.FILLED,
      vendorId: 'vendor-1',
      vendor: {
        id: 'vendor-1',
        email: 'vendor@example.com',
      },
      deliveryDeadlineUtc: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
      disputes: [],
    };

    const mockEscrow = {
      id: 'escrow-1',
      totalHeld: 10000,
      releasedAmount: 0,
      withheldAmount: 0,
    };

    it('should release escrow successfully', async () => {
      mockPrismaService.pool.findUnique.mockResolvedValue(mockPool);
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(mockEscrow);

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.escrowEntry.update.mockResolvedValue({
        ...mockEscrow,
        releasedAmount: 9500,
      });
      mockPrismaService.transaction.create.mockResolvedValue({ id: 'txn-1' });
      mockPrismaService.pool.update.mockResolvedValue({ ...mockPool, status: PoolStatus.COMPLETED });

      const result = await service.releaseEscrow('pool-1', 'Test release');

      expect(result.message).toBe('Escrow released successfully');
      expect(result.amountReleased).toBe(9500); // After 5% commission
      expect(result.commission).toBe(500);
      expect(result.transactionId).toBe('escrow-1');
      expect(mockEmailChannel.send).toHaveBeenCalledWith(
        'vendor@example.com',
        'Escrow Released',
        expect.stringContaining('₦9,500'),
      );
    });

    it('should throw BadRequestException if pool is not filled', async () => {
      const poolNotFilled = { ...mockPool, status: PoolStatus.OPEN };
      mockPrismaService.pool.findUnique.mockResolvedValue(poolNotFilled);

      await expect(service.releaseEscrow('pool-1')).rejects.toThrow(
        'Pool must be filled before escrow release',
      );
    });

    it('should throw BadRequestException if there are open disputes', async () => {
      const poolWithDisputes = {
        ...mockPool,
        disputes: [{ id: 'dispute-1', status: 'open' }],
      };
      mockPrismaService.pool.findUnique.mockResolvedValue(poolWithDisputes);

      await expect(service.releaseEscrow('pool-1')).rejects.toThrow(
        'Cannot release escrow with open disputes',
      );
    });

    it('should throw BadRequestException if grace period has not ended', async () => {
      const poolInGracePeriod = {
        ...mockPool,
        deliveryDeadlineUtc: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
      };
      mockPrismaService.pool.findUnique.mockResolvedValue(poolInGracePeriod);

      await expect(service.releaseEscrow('pool-1')).rejects.toThrow(
        'Cannot release escrow before grace period ends',
      );
    });

    it('should throw NotFoundException if escrow entry not found', async () => {
      mockPrismaService.pool.findUnique.mockResolvedValue(mockPool);
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(null);

      await expect(service.releaseEscrow('pool-1')).rejects.toThrow(
        'Escrow entry not found',
      );
    });

    it('should throw BadRequestException if no amount available for release', async () => {
      const fullyReleasedEscrow = {
        ...mockEscrow,
        totalHeld: 10000,
        releasedAmount: 10000,
        withheldAmount: 0,
      };
      mockPrismaService.pool.findUnique.mockResolvedValue(mockPool);
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(fullyReleasedEscrow);

      await expect(service.releaseEscrow('pool-1')).rejects.toThrow(
        'No amount available for release',
      );
    });
  });

  describe('partialRelease', () => {
    const mockEscrow = {
      id: 'escrow-1',
      poolId: 'pool-1',
      totalHeld: 20000,
      releasedAmount: 0,
      withheldAmount: 0,
      computations: {
        contributions: {
          'user-1': 10000,
          'user-2': 10000,
        },
      },
      pool: {
        vendorId: 'vendor-1',
      },
    };

    it('should perform partial release successfully', async () => {
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(mockEscrow);

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.escrowEntry.update.mockResolvedValue({
        ...mockEscrow,
        releasedAmount: 8000,
      });
      mockPrismaService.transaction.create.mockResolvedValue({ id: 'txn-1' });

      const releaseMap = {
        'user-1': 8000,
      };

      const result = await service.partialRelease('pool-1', releaseMap);

      expect(result.message).toBe('Partial escrow released');
      expect(result.amountReleased).toBe(7600); // After 5% commission on 8000
      expect(result.commission).toBe(400);
    });

    it('should throw BadRequestException if release amount exceeds contribution', async () => {
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(mockEscrow);

      const releaseMap = {
        'user-1': 15000, // More than user's contribution of 10000
      };

      await expect(service.partialRelease('pool-1', releaseMap)).rejects.toThrow(
        'Release amount for user user-1 exceeds their contribution',
      );
    });

    it('should throw NotFoundException if escrow not found', async () => {
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(null);

      await expect(service.partialRelease('pool-1', {})).rejects.toThrow(
        'Escrow entry not found',
      );
    });
  });

  describe('manualRelease', () => {
    const mockEscrow = {
      id: 'escrow-1',
      poolId: 'pool-1',
      totalHeld: 10000,
      releasedAmount: 0,
      withheldAmount: 0,
      pool: {
        vendorId: 'vendor-1',
        vendor: {
          id: 'vendor-1',
          email: 'vendor@example.com',
        },
      },
    };

    it('should perform manual release successfully', async () => {
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(mockEscrow);

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.escrowEntry.update.mockResolvedValue({
        ...mockEscrow,
        releasedAmount: 5000,
      });
      mockPrismaService.transaction.create.mockResolvedValue({ id: 'txn-1' });

      const result = await service.manualRelease('pool-1', 5000, 'Admin override');

      expect(result.message).toBe('Manual release successful');
      expect(result.amount).toBe(5000);
      expect(result.reason).toBe('Admin override');
      expect(mockEmailChannel.send).toHaveBeenCalledWith(
        'vendor@example.com',
        'Manual Escrow Release',
        expect.stringContaining('₦5,000'),
      );
    });

    it('should throw BadRequestException if amount exceeds available balance', async () => {
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(mockEscrow);

      await expect(service.manualRelease('pool-1', 15000, 'Too much')).rejects.toThrow(
        'Amount exceeds available escrow balance',
      );
    });

    it('should throw NotFoundException if escrow not found', async () => {
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(null);

      await expect(service.manualRelease('pool-1', 5000, 'Test')).rejects.toThrow(
        'Escrow entry not found',
      );
    });
  });

  describe('manualRefund', () => {
    const mockTransaction = {
      id: 'txn-1',
      userId: 'user-1',
      poolId: 'pool-1',
      amount: 10000,
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
    };

    const mockEscrow = {
      id: 'escrow-1',
      totalHeld: 10000,
    };

    it('should perform manual refund successfully', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(mockTransaction);

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrismaService);
      });

      mockPrismaService.transaction.create.mockResolvedValue({ id: 'refund-txn' });
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(mockEscrow);
      mockPrismaService.escrowEntry.update.mockResolvedValue({
        ...mockEscrow,
        totalHeld: 0,
      });

      const result = await service.manualRefund('txn-1', 5000, 'Quality issue');

      expect(result.message).toBe('Refund processed successfully');
      expect(result.amount).toBe(5000);
      expect(result.transactionId).toBe('txn-1');
      expect(mockEmailChannel.send).toHaveBeenCalledWith(
        'user@example.com',
        'Refund Processed',
        expect.stringContaining('₦5,000'),
      );
    });

    it('should throw NotFoundException if transaction not found', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null);

      await expect(service.manualRefund('txn-1', 5000, 'Test')).rejects.toThrow(
        'Transaction not found',
      );
    });

    it('should throw BadRequestException if refund amount exceeds transaction amount', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(mockTransaction);

      await expect(service.manualRefund('txn-1', 15000, 'Too much')).rejects.toThrow(
        'Refund amount exceeds transaction amount',
      );
    });
  });

  describe('withholdEscrow', () => {
    const mockEscrow = {
      id: 'escrow-1',
      totalHeld: 10000,
      releasedAmount: 0,
      withheldAmount: 0,
    };

    it('should withhold amount successfully', async () => {
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(mockEscrow);
      mockPrismaService.escrowEntry.update.mockResolvedValue({
        ...mockEscrow,
        withheldAmount: 3000,
      });

      await service.withholdEscrow('pool-1', 3000, 'Dispute reason');

      expect(mockPrismaService.escrowEntry.update).toHaveBeenCalledWith({
        where: { id: 'escrow-1' },
        data: {
          withheldAmount: 3000,
          withheldReason: 'Dispute reason',
        },
      });
    });

    it('should throw NotFoundException if escrow not found', async () => {
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(null);

      await expect(service.withholdEscrow('pool-1', 1000, 'Test')).rejects.toThrow(
        'Escrow entry not found',
      );
    });

    it('should throw BadRequestException if withhold amount exceeds available balance', async () => {
      mockPrismaService.escrowEntry.findFirst.mockResolvedValue(mockEscrow);

      await expect(service.withholdEscrow('pool-1', 15000, 'Too much')).rejects.toThrow(
        'Withhold amount exceeds available balance',
      );
    });
  });

  describe('COMMISSION_RATE', () => {
    it('should have a 5% commission rate', () => {
      const serviceInstance = new EscrowService(mockPrismaService as any, mockEmailChannel as any);
      expect((serviceInstance as any).COMMISSION_RATE).toBe(0.05);
    });
  });
});