import { PrismaClient, Role, PoolCategory } from '@prisma/client';
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
        isAdmin: true,
        role: Role.SUPERADMIN,
        isVerified: true,
      },
      {
        email: 'admin@farmshare.com',
        name: 'Admin User',
        phone: '+2348000000000',
        password: hashedpassword,
        isAdmin: true,
        role: Role.ADMIN,
        isVerified: true,
      },
      {
        email: 'user@farmshare.com',
        name: 'Regular User',
        phone: '+2348111111111',
        password: hashedpassword,
        role: Role.USER,
        isVerified: true,
      },
    ],
  });

  const admin = await prisma.user.findFirst({
    where: { email: 'admin@farmshare.com' },
  });

  if (!admin) {
    throw new Error('Admin user not found');
  }

  await prisma.pool.createMany({
    data: [
      {
        name: 'Cow',
        price: 650000,
        totalSlots: 1,
        slotsLeft: 1,
        category: PoolCategory.COW,
        description: `1 People to share a cow`,
        adminId: admin.id,
      },
      {
        name: 'Cow',
        price: 650000,
        totalSlots: 3,
        slotsLeft: 3,
        category: PoolCategory.COW,
        description: `3 People to share a cow`,
        adminId: admin.id,
      },
      {
        name: 'Cow',
        price: 650000,
        totalSlots: 6,
        slotsLeft: 6,
        category: PoolCategory.COW,
        description: `6 People to share a cow`,
        adminId: admin.id,
      },
      {
        name: 'Scunbia Fish',
        price: 300000,
        totalSlots: 1,
        slotsLeft: 1,
        category: PoolCategory.FISH,
        description: '1 Person to carry one carton of fish',
        adminId: admin.id,
      },
      {
        name: 'Scunbia Fish',
        price: 300000,
        totalSlots: 3,
        slotsLeft: 3,
        category: PoolCategory.FISH,
        description: '3 People to carry one carton of fish',
        adminId: admin.id,
      },
      {
        name: 'Scunbia Fish',
        price: 300000,
        totalSlots: 6,
        slotsLeft: 6,
        category: PoolCategory.FISH,
        description: '6 People to carry one carton of fish',
        adminId: admin.id,
      },
    ],
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
