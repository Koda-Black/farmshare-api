import { PrismaClient, Role, VerificationStatus, PoolStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seedProducts() {
  const products = [
    { name: 'Fresh Tomatoes', sku: 'TOM001', unit: 'kg', category: 'vegetables', description: 'Fresh, ripe tomatoes from local farms' },
    { name: 'Red Onions', sku: 'ONI001', unit: 'kg', category: 'vegetables', description: 'Premium red onions' },
    { name: 'Bell Peppers', sku: 'PEP001', unit: 'kg', category: 'vegetables', description: 'Colorful bell peppers mix' },
    { name: 'Sweet Mangoes', sku: 'MAN001', unit: 'piece', category: 'fruits', description: 'Sweet, juicy mangoes' },
    { name: 'Bananas', sku: 'BAN001', unit: 'bunch', category: 'fruits', description: 'Fresh banana bunches' },
    { name: 'Long Grain Rice', sku: 'RIC001', unit: 'bag', category: 'grains', description: 'Premium quality long grain rice' },
    { name: 'Honey Beans', sku: 'BEA001', unit: 'kg', category: 'legumes', description: 'Nutritious honey beans' },
    { name: 'White Yam', sku: 'YAM001', unit: 'tuber', category: 'tubers', description: 'Fresh white yam tubers' },
    { name: 'Irish Potatoes', sku: 'POT001', unit: 'kg', category: 'tubers', description: 'High quality irish potatoes' },
    { name: 'Live Chickens', sku: 'CHK001', unit: 'bird', category: 'livestock', description: 'Healthy live chickens' },
    { name: 'Fresh Fish', sku: 'FIS001', unit: 'kg', category: 'fish', description: 'Fresh caught fish' },
    { name: 'Fresh Milk', sku: 'MLK001', unit: 'liter', category: 'dairy', description: 'Farm fresh cow milk' },
  ];

  for (const product of products) {
    await prisma.productCatalog.upsert({
      where: { sku: product.sku },
      update: product,
      create: {
        ...product,
        imageUrl: `https://images.unsplash.com/photo-1594473222338-d23f2c1d9f2b?w=400&h=300&fit=crop&auto=format`,
      },
    });
  }

  console.log('✅ Products seeded successfully');
}

async function seedVendors() {
  const vendorData = [
    {
      email: 'greenfarms@farmshare.ng',
      name: 'Green Fields Farms',
      password: await bcrypt.hash('password123', 10),
      role: Role.VENDOR,
      verificationStatus: VerificationStatus.VERIFIED,
      bankVerified: true,
      businessRegistrationNumber: 'RC123456',
      taxId: 'TAX001',
    },
    {
      email: 'sunshine@farmshare.ng',
      name: 'Sunshine Agriculture',
      password: await bcrypt.hash('password123', 10),
      role: Role.VENDOR,
      verificationStatus: VerificationStatus.VERIFIED,
      bankVerified: true,
      businessRegistrationNumber: 'RC789012',
      taxId: 'TAX002',
    },
    {
      email: 'harvest@farmshare.ng',
      name: 'Harvest Delights Ltd',
      password: await bcrypt.hash('password123', 10),
      role: Role.VENDOR,
      verificationStatus: VerificationStatus.VERIFIED,
      bankVerified: true,
      businessRegistrationNumber: 'RC345678',
      taxId: 'TAX003',
    },
  ];

  const vendors: any[] = [];
  for (const data of vendorData) {
    const vendor = await prisma.user.upsert({
      where: { email: data.email },
      update: data,
      create: data,
    });
    vendors.push(vendor);
  }

  console.log('✅ Vendors seeded successfully');
  return vendors;
}

async function seedPools(vendors: any[]) {
  const products = await prisma.productCatalog.findMany({
    where: { active: true }
  });

  if (products.length === 0) {
    console.log('❌ No products found. Please seed products first.');
    return;
  }

  // Clean existing data in order
  await prisma.subscription.deleteMany({});
  await prisma.pendingSubscription.deleteMany({});
  await prisma.poolSlot.deleteMany({});
  await prisma.escrowEntry.deleteMany({});
  await prisma.dispute.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.pool.deleteMany({});
  console.log('🧹 Cleared existing pools and related data');

  const poolData = [
    // Vegetables
    {
      productId: products.find(p => p.name.includes('Tomatoes'))?.id,
      vendorId: vendors[0].id,
      priceTotal: 150000,
      slotsCount: 100,
      allowHomeDelivery: true,
      homeDeliveryCost: 2500,
    },
    {
      productId: products.find(p => p.name.includes('Onions'))?.id,
      vendorId: vendors[1].id,
      priceTotal: 120000,
      slotsCount: 100,
      allowHomeDelivery: true,
      homeDeliveryCost: 2000,
    },
    {
      productId: products.find(p => p.name.includes('Peppers'))?.id,
      vendorId: vendors[0].id,
      priceTotal: 80000,
      slotsCount: 100,
      allowHomeDelivery: false,
      homeDeliveryCost: null,
    },
    // Fruits
    {
      productId: products.find(p => p.name.includes('Mangoes'))?.id,
      vendorId: vendors[1].id,
      priceTotal: 200000,
      slotsCount: 100,
      allowHomeDelivery: true,
      homeDeliveryCost: 3000,
    },
    {
      productId: products.find(p => p.name.includes('Bananas'))?.id,
      vendorId: vendors[2].id,
      priceTotal: 75000,
      slotsCount: 100,
      allowHomeDelivery: true,
      homeDeliveryCost: 1500,
    },
    // Grains
    {
      productId: products.find(p => p.name.includes('Rice'))?.id,
      vendorId: vendors[2].id,
      priceTotal: 500000,
      slotsCount: 100,
      allowHomeDelivery: true,
      homeDeliveryCost: 4000,
    },
    {
      productId: products.find(p => p.name.includes('Beans'))?.id,
      vendorId: vendors[0].id,
      priceTotal: 180000,
      slotsCount: 100,
      allowHomeDelivery: true,
      homeDeliveryCost: 3500,
    },
    // Tubers
    {
      productId: products.find(p => p.name.includes('Yam'))?.id,
      vendorId: vendors[1].id,
      priceTotal: 300000,
      slotsCount: 100,
      allowHomeDelivery: true,
      homeDeliveryCost: 5000,
    },
    {
      productId: products.find(p => p.name.includes('Potatoes'))?.id,
      vendorId: vendors[2].id,
      priceTotal: 120000,
      slotsCount: 100,
      allowHomeDelivery: true,
      homeDeliveryCost: 2500,
    },
    // Others
    {
      productId: products.find(p => p.name.includes('Chickens'))?.id,
      vendorId: vendors[0].id,
      priceTotal: 400000,
      slotsCount: 50,
      allowHomeDelivery: false,
      homeDeliveryCost: null,
    },
    {
      productId: products.find(p => p.name.includes('Fish'))?.id,
      vendorId: vendors[1].id,
      priceTotal: 250000,
      slotsCount: 50,
      allowHomeDelivery: true,
      homeDeliveryCost: 3000,
    },
    {
      productId: products.find(p => p.name.includes('Milk'))?.id,
      vendorId: vendors[2].id,
      priceTotal: 150000,
      slotsCount: 50,
      allowHomeDelivery: true,
      homeDeliveryCost: 2000,
    },
  ];

  for (const data of poolData) {
    if (!data.productId) {
      console.log('⚠️ Skipping pool - no product found');
      continue;
    }

    if (!data.vendorId) {
      console.log('⚠️ Skipping pool - no vendor found');
      continue;
    }

    const pricePerSlot = Math.round(data.priceTotal / data.slotsCount);

    const pool = await prisma.pool.create({
      data: {
        productId: data.productId,
        vendorId: data.vendorId,
        priceTotal: data.priceTotal,
        slotsCount: data.slotsCount,
        pricePerSlot,
        commissionRate: 0.05,
        allowHomeDelivery: data.allowHomeDelivery,
        homeDeliveryCost: data.homeDeliveryCost,
        maxSlots: data.slotsCount,
        minUnitsConstraint: 1,
        timezone: 'Africa/Lagos',
        status: PoolStatus.OPEN,
        createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
      include: {
        product: true,
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
            bankVerified: true,
          },
        },
      },
    });

    console.log(`✅ Created pool: ${pool.product.name} - ₦${pricePerSlot.toLocaleString()} per slot`);
  }
}

async function main() {
  console.log('🌱 Starting database seeding...');

  await seedProducts();
  const vendors = await seedVendors();
  await seedPools(vendors);

  console.log('\n🎉 Database seeding completed!');
  console.log('\n📊 You can now test the marketplace with real pool data');

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  });