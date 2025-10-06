import {
  Controller,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  Headers,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { InitPaymentDto } from './dto/init-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('pay')
  async initiatePayment(@GetUser() user, @Body() body: InitPaymentDto) {
    return this.paymentsService.init({
      method: body.method,
      userId: user.id,
      poolId: body.poolId,
      slots: body.slots,
      waybillWithin: body.waybillWithin,
      waybillOutside: body.waybillOutside,
    });
  }

  @Post('paystack/verify')
  async verifyPaystack(@Query('reference') reference: string) {
    return this.paymentsService.verifyPaystack(reference);
  }

  @Post('stripe/webhook')
  async stripeWebhook(
    @Req() req,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.paymentsService.handleStripeWebhook(req.body, signature);
  }
}
