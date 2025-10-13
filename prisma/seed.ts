import { PrismaClient, Role } from '@prisma/client';
const prisma = new PrismaClient();
import * as bcrypt from 'bcrypt';

async function main() {
  const plainPassword = 'test1234';
  const hashedpassword = await bcrypt.hash(plainPassword, 10);

  await prisma.user.createMany({
    data: [
      {
        email: 'suparadmin@farmshare.com',
        name: 'Super Admin User',
        phone: '+2348000000001',
        password: hashedpassword,
        role: Role.ADMIN,
        verificationStatus: 'VERIFIED',
      },
      {
        email: 'admin@farmshare.com',
        name: 'Admin User',
        phone: '+2348000000000',
        password: hashedpassword,
        role: Role.ADMIN,
        verificationStatus: 'VERIFIED',
      },
      {
        email: 'user@farmshare.com',
        name: 'Regular User',
        phone: '+2348111111111',
        password: hashedpassword,
        role: Role.BUYER,
        verificationStatus: 'VERIFIED',
      },
    ],
  });

  const admin = await prisma.user.findFirst({
    where: { email: 'admin@farmshare.com' },
  });

  if (!admin) {
    throw new Error('Admin user not found');
  }

  // Seed minimal catalog and pools per new schema
  const product = await prisma.productCatalog.create({
    data: {
      name: 'Cow',
      sku: 'COW-001',
      unit: 'head',
      active: true,
      adminManaged: true,
    },
  });

  await prisma.pool.create({
    data: {
      vendorId: admin.id,
      productId: product.id,
      priceTotal: 650000,
      slotsCount: 3,
      pricePerSlot: 216666.67,
      commissionRate: 0.05,
      allowHomeDelivery: false,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
