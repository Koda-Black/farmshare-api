import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService, PaymentMethod } from './payments.service';
import { PrismaService } from '../services/prisma.service';
import { StripeService } from '../services/stripe.service';
import { PaystackService } from '../services/paystack.service';
// Mock services - these don't exist yet but are referenced in PaymentsService
const mockEmailService = {
  sendSubscriptionReceipt: jest.fn(),
};
const mockWhatsappService = {
  sendSubscriptionReceipt: jest.fn(),
};
import { PaymentGateway, PaymentStatus } from '@prisma/client';

describe('PaymentsService', () => {
  let service: PaymentsService;
  const prisma = {
    pool: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn() },
    pendingSubscription: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    subscription: { create: jest.fn() },
    $transaction: jest.fn(async () => ({ id: 'sub' })),
  } as unknown as jest.Mocked<PrismaService>;

  const stripe = {
    createSession: jest.fn(),
    constructEvent: jest.fn(),
  } as unknown as jest.Mocked<StripeService>;

  const paystack = {
    initialize: jest.fn(),
    verify: jest.fn(),
  } as unknown as jest.Mocked<PaystackService>;

  const email = mockEmailService;
  const whatsapp = mockWhatsappService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeService, useValue: stripe },
        { provide: PaystackService, useValue: paystack },
        { provide: 'EmailService', useValue: email },
        { provide: 'WhatsappService', useValue: whatsapp },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  it('initiates Stripe payment', async () => {
    prisma.pool.findUnique = jest
      .fn()
      .mockResolvedValue({
        id: 'pool',
        pricePerSlot: 1000,
        slotsCount: 10,
        product: { name: 'Pool' },
      });
    prisma.user.findUnique = jest
      .fn()
      .mockResolvedValue({ id: 'user', email: 'u@e.com' });
    prisma.pendingSubscription.create = jest
      .fn()
      .mockResolvedValue({ id: 'pending' });
    stripe.createSession = jest
      .fn()
      .mockResolvedValue({ id: 'sess', url: 'https://stripe' });
    prisma.pendingSubscription.update = jest.fn().mockResolvedValue({});

    const res = await service.init({
      method: PaymentMethod.STRIPE,
      userId: 'user',
      poolId: 'pool',
      slots: 1,
      waybillWithin: false,
      waybillOutside: false,
    });

    expect(res).toEqual({ method: 'STRIPE', url: 'https://stripe' });
    expect(prisma.pendingSubscription.update).toHaveBeenCalledWith({
      where: { id: 'pending' },
      data: { stripeSessionId: 'sess' },
    });
  });

  it('initiates Paystack payment', async () => {
    prisma.pool.findUnique = jest
      .fn()
      .mockResolvedValue({
        id: 'pool',
        pricePerSlot: 2000,
        slotsCount: 10,
        product: { name: 'Pool' },
      });
    prisma.user.findUnique = jest
      .fn()
      .mockResolvedValue({ id: 'user', email: 'u@e.com' });
    prisma.pendingSubscription.create = jest
      .fn()
      .mockResolvedValue({ id: 'pending' });
    paystack.initialize = jest.fn().mockResolvedValue({
      authorization_url: 'https://paystack',
      reference: 'ref',
    });
    prisma.pendingSubscription.update = jest.fn().mockResolvedValue({});

    const res = await service.init({
      method: PaymentMethod.PAYSTACK,
      userId: 'user',
      poolId: 'pool',
      slots: 2,
      waybillWithin: true,
      waybillOutside: false,
    });

    expect(res.method).toBe('PAYSTACK');
    expect(res.url).toBe('https://paystack');
    expect(prisma.pendingSubscription.update).toHaveBeenCalledWith({
      where: { id: 'pending' },
      data: { paystackRef: 'ref' },
    });
  });

  it('finalizes subscription', async () => {
    prisma.pendingSubscription.findUnique = jest.fn().mockResolvedValue({
      id: 'pending',
      status: PaymentStatus.PENDING,
      poolId: 'pool',
      userId: 'user',
      slots: 1,
      deliveryFee: 0,
      gateway: PaymentGateway.STRIPE,
      pool: {
        id: 'pool',
        pricePerSlot: 1000,
        slotsCount: 10,
        product: { name: 'Pool' },
      },
      user: { id: 'user', email: 'u@e.com', phone: '123' },
    });
    prisma.pool.findUnique = jest
      .fn()
      .mockResolvedValue({ id: 'pool', slotsCount: 10 });
    (prisma.subscription as any).aggregate = jest
      .fn()
      .mockResolvedValue({ _sum: { slots: 4 } });
    prisma.subscription.create = jest.fn().mockResolvedValue({ id: 'sub' });
    prisma.pendingSubscription.update = jest.fn().mockResolvedValue({});
    // Simulate transaction returning created subscription
    (prisma.$transaction as any) = jest.fn(async (fn: any) => {
      const result = await fn(prisma as any);
      return result;
    });

    const res = await service.finalize('pending');
    expect(res).toEqual({ success: true });
  });
});
