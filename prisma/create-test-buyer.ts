import { PrismaClient, Role } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function createTestBuyer() {
  console.log('🌱 Creating test buyer user...')

  try {
    // Hash password
    const password = 'Test123456!'
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create test buyer
    const buyer = await prisma.user.create({
      data: {
        email: 'testbuyer@farmshare.com',
        name: 'Test Buyer',
        phone: '+2348012345678',
        password: hashedPassword,
        role: Role.BUYER,
        isVerified: true, // Auto-verify for testing
        isBanned: false,
        isAdmin: false
      }
    })

    console.log('✅ Test buyer created successfully:')
    console.log(`- Email: ${buyer.email}`)
    console.log(`- Name: ${buyer.name}`)
    console.log(`- ID: ${buyer.id}`)
    console.log(`- Password: ${password}`)
    console.log(`- Role: ${buyer.role}`)
    console.log(`- Verified: ${buyer.isVerified}`)

  } catch (error) {
    if (error.code === 'P2002') {
      console.log('ℹ️ Test buyer already exists')
    } else {
      console.error('❌ Error creating test buyer:', error)
    }
  } finally {
    await prisma.$disconnect()
  }
}

createTestBuyer()