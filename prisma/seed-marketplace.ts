import {
  PrismaClient,
  PoolStatus,
  Role,
  VerificationStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Nigerian states for our vendors
const NIGERIAN_STATES = [
  'Lagos',
  'Abuja',
  'Kano',
  'Rivers',
  'Oyo',
  'Enugu',
  'Kaduna',
  'Ogun',
  'Delta',
  'Anambra',
  'Benue',
  'Plateau',
  'Cross River',
  'Edo',
  'Imo',
];

// Sample products catalog
const PRODUCTS = [
  {
    name: 'Yam Tubers',
    sku: 'YAM-001',
    unit: 'tuber',
    description: 'Premium quality yam tubers from local farms',
    imageUrl:
      'https://images.unsplash.com/photo-1604671825586-21b16b25c8a5?w=800',
  },
  {
    name: 'Fresh Tomatoes',
    sku: 'TOM-001',
    unit: 'basket',
    description: 'Ripe, fresh tomatoes for cooking',
    imageUrl: 'https://images.unsplash.com/photo-1546094096-0df4bcaaa337?w=800',
  },
  {
    name: 'Rice (50kg Bag)',
    sku: 'RIC-001',
    unit: 'bag',
    description: 'Local Nigerian rice, well processed',
    imageUrl:
      'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800',
  },
  {
    name: 'Palm Oil',
    sku: 'OIL-001',
    unit: '25L keg',
    description: 'Pure palm oil from palm fruits',
    imageUrl:
      'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800',
  },
  {
    name: 'Healthy Goat',
    sku: 'GOA-001',
    unit: 'head',
    description: 'Healthy goats for meat',
    imageUrl:
      'https://images.unsplash.com/photo-1524024973431-2ad916746881?w=800',
  },
  {
    name: 'Fresh Catfish',
    sku: 'CAT-001',
    unit: 'kg',
    description: 'Fresh catfish from local ponds',
    imageUrl: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800',
  },
  {
    name: 'Plantain Bunch',
    sku: 'PLA-001',
    unit: 'bunch',
    description: 'Ripe plantains for cooking',
    imageUrl:
      'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=800',
  },
  {
    name: 'Fresh Eggs',
    sku: 'EGG-001',
    unit: 'crate',
    description: 'Farm fresh eggs (30 per crate)',
    imageUrl:
      'https://images.unsplash.com/photo-1518569656558-1f25e69d93d7?w=800',
  },
  {
    name: 'Honey Beans',
    sku: 'BEA-001',
    unit: 'bag',
    description: 'Nutritious honey beans',
    imageUrl:
      'https://images.unsplash.com/photo-1515543904323-dc47ca6a7e4b?w=800',
  },
  {
    name: 'Garri (White)',
    sku: 'GAR-001',
    unit: 'bag',
    description: 'Quality white garri',
    imageUrl:
      'https://images.unsplash.com/photo-1604671825586-21b16b25c8a5?w=800',
  },
  {
    name: 'Fresh Cow Milk',
    sku: 'MLK-001',
    unit: 'liter',
    description: 'Fresh pasteurized cow milk',
    imageUrl: 'https://images.unsplash.com/photo-1550583744-0e7c64b6e4a9?w=800',
  },
  {
    name: 'Healthy Cow',
    sku: 'COW-001',
    unit: 'head',
    description: 'Healthy cattle for meat or breeding',
    imageUrl: 'https://images.unsplash.com/photo-1546285473-3b1ac4b7c3ad?w=800',
  },
  {
    name: 'Fresh Crayfish',
    sku: 'CRA-001',
    unit: 'basket',
    description: 'Fresh crayfish from rivers',
    imageUrl:
      'https://images.unsplash.com/photo-1582720382177-b1923cbaa9d3?w=800',
  },
  {
    name: 'Dried Fish (Stockfish)',
    sku: 'STK-001',
    unit: 'bundle',
    description: 'Dried stockfish',
    imageUrl: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800',
  },
  {
    name: 'Irish Potatoes',
    sku: 'POT-001',
    unit: 'bag',
    description: 'Fresh Irish potatoes',
    imageUrl:
      'https://images.unsplash.com/photo-1518977676601-b53f82ber3a?w=800',
  },
];

// Vendor data with Nigerian names and states
const VENDORS = [
  {
    name: 'Chinedu Okonkwo Farms',
    email: 'chinedu.farms@test.com',
    state: 'Lagos',
    city: 'Ikeja',
  },
  {
    name: 'Amina Bello Agro',
    email: 'amina.agro@test.com',
    state: 'Kano',
    city: 'Kano City',
  },
  {
    name: 'Emeka Nwosu Foods',
    email: 'emeka.foods@test.com',
    state: 'Anambra',
    city: 'Onitsha',
  },
  {
    name: 'Fatima Abdullahi Farm',
    email: 'fatima.farm@test.com',
    state: 'Kaduna',
    city: 'Kaduna City',
  },
  {
    name: 'Oluwaseun Adeyemi',
    email: 'seun.adeyemi@test.com',
    state: 'Oyo',
    city: 'Ibadan',
  },
  {
    name: 'Blessing Eze Produce',
    email: 'blessing.produce@test.com',
    state: 'Enugu',
    city: 'Enugu City',
  },
  {
    name: 'Ibrahim Musa Livestock',
    email: 'ibrahim.livestock@test.com',
    state: 'Plateau',
    city: 'Jos',
  },
  {
    name: 'Ngozi Okafor Farms',
    email: 'ngozi.farms@test.com',
    state: 'Imo',
    city: 'Owerri',
  },
  {
    name: 'Aisha Garba Agric',
    email: 'aisha.agric@test.com',
    state: 'Abuja',
    city: 'Garki',
  },
  {
    name: 'Tunde Bakare Foods',
    email: 'tunde.foods@test.com',
    state: 'Ogun',
    city: 'Abeokuta',
  },
  {
    name: 'Chioma Nnadi Farm',
    email: 'chioma.farm@test.com',
    state: 'Rivers',
    city: 'Port Harcourt',
  },
  {
    name: 'Yusuf Sani Produce',
    email: 'yusuf.produce@test.com',
    state: 'Benue',
    city: 'Makurdi',
  },
  {
    name: 'Adaeze Uche Agro',
    email: 'adaeze.agro@test.com',
    state: 'Delta',
    city: 'Warri',
  },
  {
    name: 'Mohammed Aliyu Farm',
    email: 'mohammed.farm@test.com',
    state: 'Cross River',
    city: 'Calabar',
  },
  {
    name: 'Funke Oladipo Foods',
    email: 'funke.foods@test.com',
    state: 'Edo',
    city: 'Benin City',
  },
];

async function seedMarketplace() {
  console.log('🌱 Starting marketplace seed...\n');

  const hashedPassword = await argon2.hash('Test123!');

  // Step 1: Create or update products
  console.log('📦 Creating products catalog...');
  const productMap: Record<string, string> = {};

  for (const prod of PRODUCTS) {
    const existing = await prisma.productCatalog.findFirst({
      where: { sku: prod.sku },
    });
    if (existing) {
      productMap[prod.sku] = existing.id;
      console.log(`  ✓ Product exists: ${prod.name}`);
    } else {
      const created = await prisma.productCatalog.create({
        data: {
          ...prod,
          seasonalFlag: false,
          active: true,
          adminManaged: true,
        },
      });
      productMap[prod.sku] = created.id;
      console.log(`  ✓ Created: ${prod.name}`);
    }
  }

  // Step 2: Create vendors
  console.log('\n👨‍🌾 Creating vendors...');
  const vendorIds: string[] = [];

  for (const vendor of VENDORS) {
    let user = await prisma.user.findUnique({ where: { email: vendor.email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: vendor.email,
          name: vendor.name,
          password: hashedPassword,
          role: Role.VENDOR,
          isVerified: true,
          verificationStatus: VerificationStatus.VERIFIED,
          state: vendor.state,
          city: vendor.city,
          country: 'Nigeria',
          bankVerified: true,
          bankName: 'First Bank',
          bankAccountName: vendor.name,
          bankAccountId: '0123456789',
        },
      });
      console.log(`  ✓ Created vendor: ${vendor.name} (${vendor.state})`);
    } else {
      // Update state if missing
      if (!user.state) {
        await prisma.user.update({
          where: { id: user.id },
          data: { state: vendor.state, city: vendor.city },
        });
      }
      console.log(`  ✓ Vendor exists: ${vendor.name} (${vendor.state})`);
    }
    vendorIds.push(user.id);
  }

  // Step 3: Create 15 pools from different vendors
  console.log('\n🏊 Creating pools...');

  const poolConfigs = [
    {
      vendorIdx: 0,
      productSku: 'YAM-001',
      price: 45000,
      slots: 20,
      days: 7,
      desc: 'Premium yam tubers from Lagos farms. Sweet and perfect for pounding.',
    },
    {
      vendorIdx: 1,
      productSku: 'RIC-001',
      price: 85000,
      slots: 15,
      days: 14,
      desc: 'Local Kano rice, stone-free and well milled. 50kg bags available.',
    },
    {
      vendorIdx: 2,
      productSku: 'OIL-001',
      price: 35000,
      slots: 30,
      days: 10,
      desc: 'Pure Anambra palm oil. No additives, 100% natural.',
    },
    {
      vendorIdx: 3,
      productSku: 'COW-001',
      price: 450000,
      slots: 5,
      days: 21,
      desc: 'Healthy Fulani cattle from Kaduna. Grass-fed and healthy.',
    },
    {
      vendorIdx: 4,
      productSku: 'TOM-001',
      price: 25000,
      slots: 40,
      days: 5,
      desc: 'Fresh Ibadan tomatoes. Perfect for stew and jollof.',
    },
    {
      vendorIdx: 5,
      productSku: 'CAT-001',
      price: 8000,
      slots: 50,
      days: 3,
      desc: 'Fresh catfish from Enugu ponds. Sold per kg.',
    },
    {
      vendorIdx: 6,
      productSku: 'GOA-001',
      price: 85000,
      slots: 10,
      days: 14,
      desc: 'Healthy goats from Jos plateau. Perfect for special occasions.',
    },
    {
      vendorIdx: 7,
      productSku: 'EGG-001',
      price: 4500,
      slots: 100,
      days: 7,
      desc: 'Farm fresh eggs from Owerri. 30 eggs per crate.',
    },
    {
      vendorIdx: 8,
      productSku: 'PLA-001',
      price: 15000,
      slots: 25,
      days: 5,
      desc: 'Ripe plantains from Abuja farms. Great for frying or roasting.',
    },
    {
      vendorIdx: 9,
      productSku: 'GAR-001',
      price: 28000,
      slots: 35,
      days: 14,
      desc: 'Quality white garri from Abeokuta. Well processed.',
    },
    {
      vendorIdx: 10,
      productSku: 'CRA-001',
      price: 18000,
      slots: 20,
      days: 7,
      desc: 'Fresh crayfish from Rivers state. Well cleaned and sorted.',
    },
    {
      vendorIdx: 11,
      productSku: 'BEA-001',
      price: 32000,
      slots: 25,
      days: 10,
      desc: 'Nutritious honey beans from Benue. High protein content.',
    },
    {
      vendorIdx: 12,
      productSku: 'STK-001',
      price: 22000,
      slots: 15,
      days: 21,
      desc: 'Premium stockfish from Delta. Well dried and preserved.',
    },
    {
      vendorIdx: 13,
      productSku: 'MLK-001',
      price: 2500,
      slots: 60,
      days: 2,
      desc: 'Fresh cow milk from Cross River farms. Pasteurized daily.',
    },
    {
      vendorIdx: 14,
      productSku: 'POT-001',
      price: 42000,
      slots: 20,
      days: 10,
      desc: 'Fresh Irish potatoes from Edo. Perfect for fries or chips.',
    },
  ];

  let createdCount = 0;
  for (const config of poolConfigs) {
    const vendorId = vendorIds[config.vendorIdx];
    const productId = productMap[config.productSku];

    if (!productId) {
      console.log(
        `  ⚠ Skipping pool - product not found: ${config.productSku}`,
      );
      continue;
    }

    // Check if vendor already has a pool for this product
    const existingPool = await prisma.pool.findFirst({
      where: { vendorId, productId },
    });

    if (existingPool) {
      console.log(
        `  ✓ Pool exists for vendor ${config.vendorIdx + 1}: ${config.productSku}`,
      );
      continue;
    }

    const pool = await prisma.pool.create({
      data: {
        vendorId,
        productId,
        pricePerSlot: config.price,
        slotsCount: config.slots,
        priceTotal: config.price * config.slots,
        allowHomeDelivery: true,
        homeDeliveryCost: Math.round(config.price * 0.05), // 5% delivery fee
        maxSlots: Math.ceil(config.slots / 4),
        minUnitsConstraint: 1,
        deliveryDeadlineUtc: new Date(
          Date.now() + config.days * 24 * 60 * 60 * 1000,
        ),
        status: PoolStatus.OPEN,
        commissionRate: 0.05,
      },
    });
    createdCount++;
    console.log(
      `  ✓ Created pool: ${config.productSku} (₦${config.price.toLocaleString()}/slot, ${config.slots} slots)`,
    );
  }

  // Step 4: Create a test buyer
  console.log('\n👤 Creating test buyer...');
  const testBuyer = await prisma.user.findUnique({
    where: { email: 'buyer@test.com' },
  });
  if (!testBuyer) {
    await prisma.user.create({
      data: {
        email: 'buyer@test.com',
        name: 'Test Buyer',
        password: hashedPassword,
        role: Role.BUYER,
        isVerified: true,
        state: 'Lagos',
        city: 'Victoria Island',
        country: 'Nigeria',
      },
    });
    console.log('  ✓ Created test buyer (Lagos)');
  } else {
    console.log('  ✓ Test buyer exists');
  }

  console.log('\n✅ Marketplace seed complete!');
  console.log(`   - ${PRODUCTS.length} products in catalog`);
  console.log(
    `   - ${VENDORS.length} vendors across ${NIGERIAN_STATES.length} states`,
  );
  console.log(`   - ${createdCount} new pools created`);
  console.log('\n📧 Test Credentials:');
  console.log('   Buyer: buyer@test.com / Test123!');
  console.log('   Vendor: chinedu.farms@test.com / Test123!');
}

seedMarketplace()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
