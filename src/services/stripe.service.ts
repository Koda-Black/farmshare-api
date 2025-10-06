import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrencyService } from '../services/currency.service';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    private currency: CurrencyService,
  ) {
    this.stripe = new Stripe(this.configService.get('STRIPE_SECRET_KEY') || '');
  }

  async createPaymentIntent(amountNaira: number, email: string) {
    const amountUSD = await this.currency.convertToUSD(amountNaira);

    const intent = await this.stripe.paymentIntents.create({
      amount: Math.round(amountUSD * 100),
      currency: 'usd',
      receipt_email: email,
      metadata: { origin: 'farmshare' },
    });

    return intent;
  }

  async createSession(
    userId: string,
    subscriptionId: string,
    amount: number,
    description: string,
  ) {
    return this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: description },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${this.configService.get('FRONTEND_URL')}/pools/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.configService.get('FRONTEND_URL')}/pools/cancel`,
      client_reference_id: userId,
      metadata: {
        subscriptionId,
      },
    });
  }

  constructEvent(payload: Buffer, signature: string) {
    const secret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET')!;
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }
}
