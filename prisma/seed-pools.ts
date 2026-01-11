import { PrismaClient, PoolStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function seedPools() {
  console.log('🌱 Seeding pools for Okoro Nnamchi...')

  try {
    // Find Okoro Nnamchi user
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { name: { contains: 'Okoro', mode: 'insensitive' } },
          { name: { contains: 'Nnamchi', mode: 'insensitive' } }
        ]
      }
    })

    if (!user) {
      console.log('❌ Okoro Nnamchi not found in database')
      console.log('Available users:')
      const users = await prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true }
      })
      users.forEach(u => console.log(`- ${u.name} (${u.email}) - ${u.role}`))
      return
    }

    console.log(`✅ Found user: ${user.name} (${user.email})`)

    // First, check what products exist in the catalog
    let products = await prisma.productCatalog.findMany({
      where: { active: true }
    })

    console.log(`📦 Found ${products.length} products in catalog`)
    products.forEach(p => console.log(`- ${p.name} (${p.sku})`))

    // If no products exist, create some sample products
    if (products.length === 0) {
      console.log('🌱 Creating sample products...')
      const sampleProducts = [
        {
          name: 'Yam Tubers',
          sku: 'YAM-001',
          unit: 'tuber',
          description: 'Premium quality yam tubers, well sorted and ready for planting or consumption',
          imageUrl: 'https://images.unsplash.com/photo-1604671825586-21b16b25c8a5?w=800&h=600&fit=crop&crop=entropy&auto=format',
          seasonalFlag: false,
          active: true,
          adminManaged: true
        },
        {
          name: 'Healthy Cattle',
          sku: 'CAT-001',
          unit: 'head',
          description: 'Healthy cattle for meat or dairy. Grass-fed, hormone-free, with proper health certification',
          imageUrl: 'https://images.unsplash.com/photo-1546285473-3b1ac4b7c3ad?w=800&h=600&fit=crop&crop=entropy&auto=format',
          seasonalFlag: false,
          active: true,
          adminManaged: true
        },
        {
          name: 'Honey Beans',
          sku: 'BEA-001',
          unit: 'bag',
          description: 'Fresh, locally sourced honey beans (African yam beans). Rich in protein',
          imageUrl: 'https://images.unsplash.com/photo-1542931286-26cb1c848d6b?w=800&h=600&fit=crop&crop=entropy&auto=format',
          seasonalFlag: false,
          active: true,
          adminManaged: true
        },
        {
          name: 'Fresh Crayfish',
          sku: 'CRA-001',
          unit: 'basket',
          description: 'Fresh crayfish sourced from local rivers and ponds. Well-cleaned, sorted by size',
          imageUrl: 'https://images.unsplash.com/photo-1582720382177-b1923cbaa9d3?w=800&h=600&fit=crop&crop=entropy&auto=format',
          seasonalFlag: false,
          active: true,
          adminManaged: true
        },
        {
          name: 'Fresh Cow Milk',
          sku: 'MLK-001',
          unit: 'liter',
          description: 'Fresh cow milk, pasteurized and ready for consumption. Sourced from healthy grass-fed cows',
          imageUrl: 'https://images.unsplash.com/photo-1550583744-0e7c64b6e4a9?w=800&h=600&fit=crop&crop=entropy&auto=format',
          seasonalFlag: false,
          active: true,
          adminManaged: true
        }
      ]

      for (const productData of sampleProducts) {
        const product = await prisma.productCatalog.create({
          data: productData
        })
        console.log(`✅ Created product: ${product.name} (${product.sku})`)
      }

      // Get the newly created products
      products = await prisma.productCatalog.findMany({
        where: { active: true }
      })
      console.log(`📦 Now have ${products.length} products in catalog`)
    }

    // Create 5 sample pools using available products
    const pools = [
      {
        vendorId: user.id,
        productId: products[0]?.id || 'default-product-id',
        pricePerSlot: 45000,
        slotsCount: 20,
        priceTotal: 900000,
        allowHomeDelivery: true,
        homeDeliveryCost: 3000,
        maxSlots: 10,
        minUnitsConstraint: 1,
        deliveryDeadlineUtc: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        status: PoolStatus.OPEN,
        description: 'Premium quality yam tubers, well sorted and ready for planting or consumption. Direct from our farms in Enugu.',
      },
      {
        vendorId: user.id,
        productId: products[1]?.id || 'default-product-id',
        pricePerSlot: 120000,
        slotsCount: 15,
        priceTotal: 1800000,
        allowHomeDelivery: true,
        homeDeliveryCost: 5000,
        maxSlots: 5,
        minUnitsConstraint: 1,
        deliveryDeadlineUtc: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        status: PoolStatus.OPEN,
        description: 'Healthy cattle for meat or dairy. Grass-fed, hormone-free, with proper health certification. Available for immediate slaughter or breeding.',
      },
      {
        vendorId: user.id,
        productId: products[2]?.id || 'default-product-id',
        pricePerSlot: 25000,
        slotsCount: 30,
        priceTotal: 750000,
        allowHomeDelivery: true,
        homeDeliveryCost: 2000,
        maxSlots: 15,
        minUnitsConstraint: 2,
        deliveryDeadlineUtc: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
        status: PoolStatus.OPEN,
        description: 'Fresh, locally sourced honey beans (African yam beans). Rich in protein, perfect for making moin moin and other delicacies.',
      },
      {
        vendorId: user.id,
        productId: products[3]?.id || 'default-product-id',
        pricePerSlot: 35000,
        slotsCount: 25,
        priceTotal: 875000,
        allowHomeDelivery: true,
        homeDeliveryCost: 2500,
        maxSlots: 10,
        minUnitsConstraint: 1,
        deliveryDeadlineUtc: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // 4 days from now
        status: PoolStatus.OPEN,
        description: 'Fresh crayfish sourced from local rivers and ponds. Well-cleaned, sorted by size, perfect for soups and traditional dishes.',
      },
      {
        vendorId: user.id,
        productId: products[4]?.id || 'default-product-id',
        pricePerSlot: 18000,
        slotsCount: 40,
        priceTotal: 720000,
        allowHomeDelivery: true,
        homeDeliveryCost: 1500,
        maxSlots: 20,
        minUnitsConstraint: 1,
        deliveryDeadlineUtc: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        status: PoolStatus.OPEN,
        description: 'Fresh cow milk, pasteurized and ready for consumption. Sourced from healthy grass-fed cows on our Enugu farm.',
      }
    ]

    // Delete existing pools for this user to avoid duplicates
    await prisma.pool.deleteMany({
      where: { vendorId: user.id }
    })

    // Create the pools
    const createdPools: any[] = []
    for (const poolData of pools) {
      const pool = await prisma.pool.create({
        data: {
          vendorId: poolData.vendorId,
          productId: poolData.productId,
          pricePerSlot: poolData.pricePerSlot,
          slotsCount: poolData.slotsCount,
          priceTotal: poolData.priceTotal,
          allowHomeDelivery: poolData.allowHomeDelivery,
          homeDeliveryCost: poolData.homeDeliveryCost,
          maxSlots: poolData.maxSlots,
          minUnitsConstraint: poolData.minUnitsConstraint,
          deliveryDeadlineUtc: poolData.deliveryDeadlineUtc,
          status: poolData.status
        }
      })
      createdPools.push(pool)
      console.log(`✅ Created pool: ${pool.id}`)
    }

    console.log(`✅ Successfully created ${createdPools.length} pools for ${user.name}`)

    // Get all pools with product details to display their IDs
    const allPools = await prisma.pool.findMany({
      where: { vendorId: user.id },
      include: {
        vendor: {
          select: { name: true, email: true }
        },
        product: {
          select: { name: true, sku: true }
        }
      }
    })

    console.log('\n📋 All pools for', user.name, ':')
    allPools.forEach(pool => {
      console.log(`- ID: ${pool.id}`)
      console.log(`  Product: ${pool.product?.name || 'Unknown'} (${pool.product?.sku || 'N/A'})`)
      console.log(`  Price per slot: ₦${Number(pool.pricePerSlot).toLocaleString()}`)
      console.log(`  Slots: ${pool.slotsCount}/${pool.maxSlots || 'unlimited'}`)
      console.log(`  Status: ${pool.status}`)
      console.log(`  Delivery Deadline: ${pool.deliveryDeadlineUtc ? new Date(pool.deliveryDeadlineUtc).toLocaleDateString() : 'Not set'}`)
      console.log('')
    })

    // Update the enhanced payment service with the new pool data
    console.log('\n🔄 Updating frontend pool data...')
    const poolDataForFrontend = allPools.map(pool => ({
      id: pool.id,
      product_name: pool.product?.name || 'Unknown Product',
      price_per_slot: Number(pool.pricePerSlot),
      allow_home_delivery: pool.allowHomeDelivery,
      home_delivery_cost: Number(pool.homeDeliveryCost) || 0,
      pickup_location: '123 Farm Road, Enugu State',
      vendor_name: pool.vendor?.name || 'Unknown Vendor',
      vendor_verified: true,
      vendor_rating: 4.8,
      slots_filled: Math.floor(Math.random() * pool.slotsCount * 0.6), // Mock filled slots
      slots_count: pool.slotsCount,
      created_at: pool.createdAt,
      delivery_deadline: pool.deliveryDeadlineUtc?.toISOString() || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      category: 'agricultural'
    }))

    console.log('Pool data for frontend:')
    poolDataForFrontend.forEach(pool => {
      console.log(`- ID: ${pool.id}`)
      console.log(`  Product: ${pool.product_name}`)
      console.log(`  Price: ₦${pool.price_per_slot.toLocaleString()}`)
      console.log(`  Filled: ${pool.slots_filled}/${pool.slots_count}`)
      console.log('')
    })

  } catch (error) {
    console.error('❌ Error seeding pools:', error)
  } finally {
    await prisma.$disconnect()
  }
}

seedPools()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })