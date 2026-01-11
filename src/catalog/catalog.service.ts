import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  // Get all products (for vendors to select from)
  async getAllProducts(activeOnly = true) {
    return this.prisma.productCatalog.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { name: 'asc' },
    });
  }

  // Get products by category
  async getProductsByCategory(category: string) {
    return this.prisma.productCatalog.findMany({
      where: { category, active: true },
      orderBy: { name: 'asc' },
    });
  }

  // Get single product
  async getProduct(id: string) {
    const product = await this.prisma.productCatalog.findUnique({
      where: { id },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  // ADMIN: Create a new product
  async createProduct(data: {
    name: string;
    sku: string;
    unit: string;
    category?: string;
    description?: string;
    imageUrl?: string;
    allowedUnits?: string[];
    seasonalFlag?: boolean;
  }) {
    // Check if SKU already exists
    const existing = await this.prisma.productCatalog.findUnique({
      where: { sku: data.sku },
    });
    if (existing) {
      throw new BadRequestException('Product SKU already exists');
    }

    return this.prisma.productCatalog.create({
      data: {
        name: data.name,
        sku: data.sku,
        unit: data.unit,
        category: data.category,
        description: data.description,
        imageUrl: data.imageUrl,
        allowedUnits: data.allowedUnits,
        seasonalFlag: data.seasonalFlag ?? false,
        active: true,
        adminManaged: true,
      },
    });
  }

  // ADMIN: Update a product
  async updateProduct(
    id: string,
    data: {
      name?: string;
      unit?: string;
      category?: string;
      description?: string;
      imageUrl?: string;
      allowedUnits?: string[];
      seasonalFlag?: boolean;
      active?: boolean;
    },
  ) {
    return this.prisma.productCatalog.update({
      where: { id },
      data,
    });
  }

  // ADMIN: Deactivate a product (soft delete)
  async deactivateProduct(id: string) {
    return this.prisma.productCatalog.update({
      where: { id },
      data: { active: false },
    });
  }

  // ADMIN: Activate a product
  async activateProduct(id: string) {
    return this.prisma.productCatalog.update({
      where: { id },
      data: { active: true },
    });
  }

  // VENDOR: Submit a product suggestion
  async submitSuggestion(
    vendorId: string,
    data: {
      productName: string;
      description?: string;
      category?: string;
      unit?: string;
      reason?: string;
    },
  ) {
    // Check if vendor already has a pending suggestion for this product
    const existing = await this.prisma.productSuggestion.findFirst({
      where: {
        vendorId,
        productName: { equals: data.productName, mode: 'insensitive' },
        status: 'PENDING',
      },
    });
    if (existing) {
      throw new BadRequestException(
        'You already have a pending suggestion for this product',
      );
    }

    return this.prisma.productSuggestion.create({
      data: {
        vendorId,
        productName: data.productName,
        description: data.description,
        category: data.category,
        unit: data.unit,
        reason: data.reason,
        status: 'PENDING',
      },
    });
  }

  // VENDOR: Get my suggestions
  async getVendorSuggestions(vendorId: string) {
    return this.prisma.productSuggestion.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: true,
      },
    });
  }

  // ADMIN: Get all pending suggestions
  async getPendingSuggestions() {
    return this.prisma.productSuggestion.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ADMIN: Get all suggestions
  async getAllSuggestions(status?: string) {
    return this.prisma.productSuggestion.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        product: true,
      },
    });
  }

  // ADMIN: Approve a suggestion (creates a new product)
  async approveSuggestion(
    suggestionId: string,
    adminId: string,
    productData: {
      sku: string;
      unit?: string;
      category?: string;
      description?: string;
      imageUrl?: string;
    },
  ) {
    const suggestion = await this.prisma.productSuggestion.findUnique({
      where: { id: suggestionId },
    });

    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }

    if (suggestion.status !== 'PENDING') {
      throw new BadRequestException('Suggestion already processed');
    }

    // Create the product and update the suggestion in a transaction
    return this.prisma.$transaction(async (tx) => {
      // Create the product
      const product = await tx.productCatalog.create({
        data: {
          name: suggestion.productName,
          sku: productData.sku,
          unit: productData.unit || suggestion.unit || 'kg',
          category: productData.category || suggestion.category,
          description: productData.description || suggestion.description,
          imageUrl: productData.imageUrl,
          active: true,
          adminManaged: true,
        },
      });

      // Update the suggestion
      const updatedSuggestion = await tx.productSuggestion.update({
        where: { id: suggestionId },
        data: {
          status: 'APPROVED',
          approvedById: adminId,
          approvedAt: new Date(),
          productId: product.id,
        },
        include: {
          product: true,
        },
      });

      return updatedSuggestion;
    });
  }

  // ADMIN: Reject a suggestion
  async rejectSuggestion(
    suggestionId: string,
    adminId: string,
    reason: string,
  ) {
    const suggestion = await this.prisma.productSuggestion.findUnique({
      where: { id: suggestionId },
    });

    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }

    if (suggestion.status !== 'PENDING') {
      throw new BadRequestException('Suggestion already processed');
    }

    return this.prisma.productSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: 'REJECTED',
        adminNotes: reason,
        rejectedAt: new Date(),
        approvedById: adminId,
      },
    });
  }

  // Get product categories
  async getCategories() {
    const products = await this.prisma.productCatalog.findMany({
      where: { active: true },
      select: { category: true },
      distinct: ['category'],
    });
    return products
      .map((p) => p.category)
      .filter((c): c is string => c !== null);
  }
}
