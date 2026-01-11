import { PrismaClient, Role, VerificationStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seedPools() {
  try {
    console.log('🌱 Starting to seed fresh pools...');

    // Get or create verified vendors
    const vendors = await ensureVerifiedVendors();

    // Get active products
    const products = await prisma.productCatalog.findMany({
      where: { active: true }
    });

    if (products.length === 0) {
      console.log('❌ No active products found. Please seed products first.');
      return;
    }

    // Create fresh pools with realistic data
    const freshPools = [
      // Vegetables Category
      {
        productId: products.find(p => p.category?.toLowerCase().includes('vegetable') || p.name.toLowerCase().includes('tomato'))?.id || products[0].id,
        vendorId: vendors[0].id,
        priceTotal: 150000, // ₦1,500 per slot × 100 slots
        slotsCount: 100,
        commissionRate: 0.05,
        allowHomeDelivery: true,
        homeDeliveryCost: 2500, // ₦2,500 delivery fee
        maxSlots: 100,
        minUnitsConstraint: 5,
        timezone: 'Africa/Lagos',
      },
      {
        productId: products.find(p => p.name.toLowerCase().includes('onion'))?.id || products[1].id,
        vendorId: vendors[1].id,
        priceTotal: 120000, // ₦1,200 per slot × 100 slots
        slotsCount: 100,
        commissionRate: 0.05,
        allowHomeDelivery: true,
        homeDeliveryCost: 2000,
        maxSlots: 120,
        minUnitsConstraint: 3,
        timezone: 'Africa/Lagos',
      },
      {
        productId: products.find(p => p.name.toLowerCase().includes('pepper'))?.id || products[2].id,
        vendorId: vendors[0].id,
        priceTotal: 80000, // ₦800 per slot × 100 slots
        slotsCount: 100,
        commissionRate: 0.04,
        allowHomeDelivery: false,
        homeDeliveryCost: null,
        maxSlots: 80,
        minUnitsConstraint: 10,
        timezone: 'Africa/Lagos',
      },

      // Fruits Category
      {
        productId: products.find(p => p.category?.toLowerCase().includes('fruit') || p.name.toLowerCase().includes('mango'))?.id || products[3].id,
        vendorId: vendors[1].id,
        priceTotal: 200000, // ₦2,000 per slot × 100 slots
        slotsCount: 100,
        commissionRate: 0.06,
        allowHomeDelivery: true,
        homeDeliveryCost: 3000,
        maxSlots: 150,
        minUnitsConstraint: 2,
        timezone: 'Africa/Lagos',
      },
      {
        productId: products.find(p => p.name.toLowerCase().includes('banana'))?.id || products[4].id,
        vendorId: vendors[2].id,
        priceTotal: 75000, // ₦750 per slot × 100 slots
        slotsCount: 100,
        commissionRate: 0.05,
        allowHomeDelivery: true,
        homeDeliveryCost: 1500,
        maxSlots: 100,
        minUnitsConstraint: 12,
        timezone: 'Africa/Lagos',
      },

      // Grains Category
      {
        productId: products.find(p => p.category?.toLowerCase().includes('grain') || p.name.toLowerCase().includes('rice'))?.id || products[5].id,
        vendorId: vendors[2].id,
        priceTotal: 500000, // ₦5,000 per slot × 100 slots
        slotsCount: 100,
        commissionRate: 0.03,
        allowHomeDelivery: true,
        homeDeliveryCost: 4000,
        maxSlots: 200,
        minUnitsConstraint: 1,
        timezone: 'Africa/Lagos',
      },
      {
        productId: products.find(p => p.name.toLowerCase().includes('beans'))?.id || products[6].id,
        vendorId: vendors[0].id,
        priceTotal: 180000, // ₦1,800 per slot × 100 slots
        slotsCount: 100,
        commissionRate: 0.05,
        allowHomeDelivery: true,
        homeDeliveryCost: 3500,
        maxSlots: 150,
        minUnitsConstraint: 2,
        timezone: 'Africa/Lagos',
      },

      // Tubers Category
      {
        productId: products.find(p => p.name.toLowerCase().includes('yam'))?.id || products[7].id,
        vendorId: vendors[1].id,
        priceTotal: 300000, // ₦3,000 per slot × 100 slots
        slotsCount: 100,
        commissionRate: 0.05,
        allowHomeDelivery: true,
        homeDeliveryCost: 5000,
        maxSlots: 120,
        minUnitsConstraint: 1,
        timezone: 'Africa/Lagos',
      },
      {
        productId: products.find(p => p.name.toLowerCase().includes('potato'))?.id || products[8].id,
        vendorId: vendors[2].id,
        priceTotal: 120000, // ₦1,200 per slot × 100 slots
        slotsCount: 100,
        commissionRate: 0.04,
        allowHomeDelivery: true,
        homeDeliveryCost: 2500,
        maxSlots: 100,
        minUnitsConstraint: 5,
        timezone: 'Africa/Lagos',
      },

      // Livestock Category
      {
        productId: products.find(p => p.category?.toLowerCase().includes('livestock') || p.name.toLowerCase().includes('chicken'))?.id || products[9]?.id || products[0].id,
        vendorId: vendors[0].id,
        priceTotal: 800000, // ₦8,000 per slot × 50 slots
        slotsCount: 50,
        commissionRate: 0.08,
        allowHomeDelivery: false,
        homeDeliveryCost: null,
        maxSlots: 50,
        minUnitsConstraint: 1,
        timezone: 'Africa/Lagos',
      },

      // Fish Category
      {
        productId: products.find(p => p.category?.toLowerCase().includes('fish') || p.name.toLowerCase().includes('fish'))?.id || products[10]?.id || products[1].id,
        vendorId: vendors[1].id,
        priceTotal: 250000, // ₦5,000 per slot × 50 slots
        slotsCount: 50,
        commissionRate: 0.07,
        allowHomeDelivery: true,
        homeDeliveryCost: 3000,
        maxSlots: 60,
        minUnitsConstraint: 2,
        timezone: 'Africa/Lagos',
      },

      // Dairy Category
      {
        productId: products.find(p => p.category?.toLowerCase().includes('dairy') || p.name.toLowerCase().includes('milk'))?.id || products[11]?.id || products[2].id,
        vendorId: vendors[2].id,
        priceTotal: 150000, // ₦3,000 per slot × 50 slots
        slotsCount: 50,
        commissionRate: 0.06,
        allowHomeDelivery: true,
        homeDeliveryCost: 2000,
        maxSlots: 80,
        minUnitsConstraint: 1,
        timezone: 'Africa/Lagos',
      },
    ];

    // Clean existing pools to avoid conflicts
    console.log('🧹 Cleaning existing pools...');
    await prisma.pool.deleteMany({});
    console.log('✅ Existing pools cleared');

    // Create fresh pools
    console.log('🏊 Creating fresh pools...');
    const createdPools: any[] = [];

    for (const poolData of freshPools) {
      const pricePerSlot = Math.round(poolData.priceTotal / poolData.slotsCount);

      const pool = await prisma.pool.create({
        data: {
          ...poolData,
          pricePerSlot,
          status: 'OPEN',
          createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random within last 7 days
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

      createdPools.push(pool);
      console.log(`✅ Created pool: ${pool.product.name} - ₦${pricePerSlot.toLocaleString()} per slot`);
    }

    // Create some sample subscriptions to make it look realistic
    console.log('👥 Creating sample subscriptions...');
    const buyers = await ensureSampleBuyers();

    for (let i = 0; i < Math.min(createdPools.length / 2, 5); i++) {
      const pool = createdPools[i];
      const randomBuyer = buyers[Math.floor(Math.random() * buyers.length)];
      const slotsToBuy = Math.min(
        Math.floor(Math.random() * pool.minUnitsConstraint * 2) + 1,
        pool.slotsCount / 4
      );

      if (slotsToBuy > 0) {
        await prisma.subscription.create({
          data: {
            userId: randomBuyer.id,
            poolId: pool.id,
            slots: slotsToBuy,
            amountPaid: pool.pricePerSlot * slotsToBuy,
            paymentMethod: 'PAYSTACK',
            paymentRef: `sample_${Date.now()}_${i}`,
            deliveryFee: pool.allowHomeDelivery ? pool.homeDeliveryCost || 0 : 0,
          },
        });

        console.log(`📝 Added subscription: ${randomBuyer.name} bought ${slotsToBuy} slots of ${pool.product.name}`);
      }
    }

    console.log(`\n🎉 Successfully seeded ${createdPools.length} fresh pools!`);
    console.log('📊 Pool Summary:');

    const summary = createdPools.reduce((acc, pool) => {
      const category = pool.product.category || 'other';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    Object.entries(summary).forEach(([category, count]) => {
      console.log(`   ${category}: ${count} pools`);
    });

  } catch (error) {
    console.error('❌ Error seeding pools:', error);
    throw error;
  }
}

async function ensureVerifiedVendors() {
  console.log('👨‍🌾 Ensuring verified vendors exist...');

  const vendorData = [
    {
      email: 'vendor1@farmshare.ng',
      name: 'Green Fields Farms',
      password: await bcrypt.hash('password123', 10),
      role: Role.VENDOR,
      verificationStatus: VerificationStatus.VERIFIED,
      bankVerified: true,
      businessRegistrationNumber: 'RC123456',
      taxId: 'TAX001',
    },
    {
      email: 'vendor2@farmshare.ng',
      name: 'Sunshine Agriculture',
      password: await bcrypt.hash('password123', 10),
      role: Role.VENDOR,
      verificationStatus: VerificationStatus.VERIFIED,
      bankVerified: true,
      businessRegistrationNumber: 'RC789012',
      taxId: 'TAX002',
    },
    {
      email: 'vendor3@farmshare.ng',
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

  console.log(`✅ ${vendors.length} verified vendors ready`);
  return vendors;
}

async function ensureSampleBuyers() {
  console.log('🛒 Ensuring sample buyers exist...');

  const buyerData = [
    {
      email: 'buyer1@farmshare.ng',
      name: 'Amina Bello',
      password: await bcrypt.hash('password123', 10),
      role: Role.BUYER,
      verificationStatus: VerificationStatus.VERIFIED,
    },
    {
      email: 'buyer2@farmshare.ng',
      name: 'Chukwu Okafor',
      password: await bcrypt.hash('password123', 10),
      role: Role.BUYER,
      verificationStatus: VerificationStatus.VERIFIED,
    },
    {
      email: 'buyer3@farmshare.ng',
      name: 'Fatima Ibrahim',
      password: await bcrypt.hash('password123', 10),
      role: Role.BUYER,
      verificationStatus: VerificationStatus.VERIFIED,
    },
  ];

  const buyers: any[] = [];
  for (const data of buyerData) {
    const buyer = await prisma.user.upsert({
      where: { email: data.email },
      update: data,
      create: data,
    });
    buyers.push(buyer);
  }

  console.log(`✅ ${buyers.length} sample buyers ready`);
  return buyers;
}

async function main() {
  await seedPools();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });