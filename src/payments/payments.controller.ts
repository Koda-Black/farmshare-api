import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
  Headers,
  UnauthorizedException,
  Logger,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { InitPaymentDto } from './dto/init-payment.dto';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('pay')
  @UseGuards(JwtAuthGuard)
  async initiatePayment(@GetUser() user, @Body() body: InitPaymentDto) {
    // Production-ready payment initiation - user must be authenticated
    if (!user || !user.id) {
      throw new UnauthorizedException('User authentication required');
    }

    // Ensure user is a buyer (vendors cannot buy from their own pools)
    if (user.role !== 'BUYER') {
      throw new UnauthorizedException('Only buyers can initiate payments');
    }

    try {
      const result = await this.paymentsService.init({
        method: body.method,
        userId: user.id,
        poolId: body.poolId,
        slots: body.slots,
        waybillWithin: body.waybillWithin,
        waybillOutside: body.waybillOutside,
        idempotencyKey: body.idempotencyKey,
      });
      return result;
    } catch (error) {
      this.logger.error(`Payment initiation failed for user ${user.id}:`, error);
      throw error;
    }
  }

  @Post('paystack/verify')
  async verifyPaystack(@Query('reference') reference: string) {
    const result = await this.paymentsService.verifyPaystack(reference);
    this.logger.log(`Paystack verification result for reference ${reference}:`, JSON.stringify(result, null, 2));
    return result;
  }

  @Get('paystack/verify')
  async verifyPaystackGet(
    @Query('reference') reference: string,
    @Query('trxref') trxref: string,
    @Res() res: any,
  ) {
    this.logger.log(`Paystack GET verification request - reference: ${reference}, trxref: ${trxref}`);
    try {
      // Paystack redirects here after successful payment
      // Verify the transaction and redirect back to frontend
      const result = await this.paymentsService.verifyPaystack(reference || trxref);
      this.logger.log(`Paystack GET verification result:`, JSON.stringify(result, null, 2));

      if (result.success) {
        // Redirect to frontend with success status
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const redirectUrl = `${frontendUrl}/payment/success?reference=${reference || trxref}&status=success`;
        this.logger.log(`Redirecting to success: ${redirectUrl}`);
        return res.redirect(redirectUrl);
      } else {
        // Redirect to frontend with failure status
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const redirectUrl = `${frontendUrl}/payment/failed?reference=${reference || trxref}&status=failed`;
        this.logger.log(`Redirecting to failed: ${redirectUrl}`);
        return res.redirect(redirectUrl);
      }
    } catch (error) {
      this.logger.error('Paystack verification failed:', error);
      // Redirect to frontend with error status
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/payment/failed?reference=${reference || trxref}&status=error`);
    }
  }

  @Post('paystack/webhook')
  async paystackWebhook(@Req() req) {
    return this.paymentsService.handlePaystackWebhook(req);
  }

  @Post('stripe/webhook')
  async stripeWebhook(
    @Req() req,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.paymentsService.handleStripeWebhook(req.body, signature);
  }
}
