import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ParseBoolPipe,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { NewsletterService } from './newsletter.service';
import {
  SubscribeNewsletterDto,
  UnsubscribeNewsletterDto,
  SendNewsletterDto,
} from './dto/newsletter.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@ApiTags('Newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe to newsletter' })
  @ApiResponse({ status: 201, description: 'Successfully subscribed' })
  @ApiResponse({ status: 409, description: 'Email already subscribed' })
  async subscribe(@Body() dto: SubscribeNewsletterDto) {
    return this.newsletterService.subscribe(dto);
  }

  @Post('unsubscribe')
  @ApiOperation({ summary: 'Unsubscribe from newsletter' })
  @ApiResponse({ status: 200, description: 'Successfully unsubscribed' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async unsubscribe(@Body() dto: UnsubscribeNewsletterDto) {
    return this.newsletterService.unsubscribe(dto);
  }

  // Admin-only endpoints below
  @Get('subscribers')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all newsletter subscribers (Admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'List of subscribers' })
  async getSubscribers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('activeOnly', new DefaultValuePipe(true), ParseBoolPipe)
    activeOnly: boolean,
  ) {
    return this.newsletterService.getAllSubscribers(page, limit, activeOnly);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get newsletter statistics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Newsletter statistics' })
  async getStats() {
    return this.newsletterService.getStats();
  }

  @Delete('subscriber/:email')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Permanently delete a subscriber (Admin only)' })
  @ApiResponse({ status: 200, description: 'Subscriber deleted' })
  async deleteSubscriber(@Param('email') email: string) {
    return this.newsletterService.deleteSubscriber(email);
  }

  @Post('send')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send newsletter to subscribers (Admin only)' })
  @ApiResponse({ status: 200, description: 'Newsletter sent' })
  async sendNewsletter(@Body() dto: SendNewsletterDto) {
    return this.newsletterService.sendNewsletter(dto);
  }
}
