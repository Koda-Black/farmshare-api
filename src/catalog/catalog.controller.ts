import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // PUBLIC: Get all products
  @Get('products')
  @ApiOperation({ summary: 'Get all products in catalog' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  getAllProducts(@Query('activeOnly') activeOnly?: string) {
    return this.catalogService.getAllProducts(activeOnly !== 'false');
  }

  // PUBLIC: Get products by category
  @Get('products/category/:category')
  @ApiOperation({ summary: 'Get products by category' })
  getProductsByCategory(@Param('category') category: string) {
    return this.catalogService.getProductsByCategory(category);
  }

  // PUBLIC: Get single product
  @Get('products/:id')
  @ApiOperation({ summary: 'Get single product' })
  getProduct(@Param('id') id: string) {
    return this.catalogService.getProduct(id);
  }

  // PUBLIC: Get all categories
  @Get('categories')
  @ApiOperation({ summary: 'Get all product categories' })
  getCategories() {
    return this.catalogService.getCategories();
  }

  // ADMIN: Create a new product
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('products')
  @ApiOperation({ summary: 'Admin: Create a new product' })
  createProduct(
    @Body()
    body: {
      name: string;
      sku: string;
      unit: string;
      category?: string;
      description?: string;
      imageUrl?: string;
      allowedUnits?: string[];
      seasonalFlag?: boolean;
    },
  ) {
    return this.catalogService.createProduct(body);
  }

  // ADMIN: Update a product
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch('products/:id')
  @ApiOperation({ summary: 'Admin: Update a product' })
  updateProduct(
    @Param('id') id: string,
    @Body()
    body: {
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
    return this.catalogService.updateProduct(id, body);
  }

  // ADMIN: Deactivate a product
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('products/:id')
  @ApiOperation({ summary: 'Admin: Deactivate a product' })
  deactivateProduct(@Param('id') id: string) {
    return this.catalogService.deactivateProduct(id);
  }

  // ADMIN: Activate a product
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch('products/:id/activate')
  @ApiOperation({ summary: 'Admin: Activate a product' })
  activateProduct(@Param('id') id: string) {
    return this.catalogService.activateProduct(id);
  }

  // VENDOR: Submit a product suggestion
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('vendor')
  @Post('suggestions')
  @ApiOperation({ summary: 'Vendor: Submit a product suggestion' })
  submitSuggestion(
    @Req() req,
    @Body()
    body: {
      productName: string;
      description?: string;
      category?: string;
      unit?: string;
      reason?: string;
    },
  ) {
    return this.catalogService.submitSuggestion(req.user.userId, body);
  }

  // VENDOR: Get my suggestions
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('vendor')
  @Get('suggestions/my')
  @ApiOperation({ summary: 'Vendor: Get my product suggestions' })
  getVendorSuggestions(@Req() req) {
    return this.catalogService.getVendorSuggestions(req.user.userId);
  }

  // ADMIN: Get all suggestions
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('suggestions')
  @ApiOperation({ summary: 'Admin: Get all suggestions' })
  @ApiQuery({ name: 'status', required: false })
  getAllSuggestions(@Query('status') status?: string) {
    return this.catalogService.getAllSuggestions(status);
  }

  // ADMIN: Get pending suggestions
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('suggestions/pending')
  @ApiOperation({ summary: 'Admin: Get pending suggestions' })
  getPendingSuggestions() {
    return this.catalogService.getPendingSuggestions();
  }

  // ADMIN: Approve a suggestion
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('suggestions/:id/approve')
  @ApiOperation({ summary: 'Admin: Approve a suggestion and create product' })
  approveSuggestion(
    @Req() req,
    @Param('id') id: string,
    @Body()
    body: {
      sku: string;
      unit?: string;
      category?: string;
      description?: string;
      imageUrl?: string;
    },
  ) {
    return this.catalogService.approveSuggestion(id, req.user.userId, body);
  }

  // ADMIN: Reject a suggestion
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('suggestions/:id/reject')
  @ApiOperation({ summary: 'Admin: Reject a suggestion' })
  rejectSuggestion(
    @Req() req,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.catalogService.rejectSuggestion(
      id,
      req.user.userId,
      body.reason,
    );
  }
}
