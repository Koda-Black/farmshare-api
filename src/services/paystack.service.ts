import { Injectable, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PaystackService {
  private readonly secret: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.secret = this.config.get<string>('PAYSTACK_SECRET')!;
  }

  async initialize(amount: number, metadata: any) {
    const observable = this.http.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: metadata.email,
        amount: amount * 100,
        metadata,
        callback_url: this.config.get<string>('PAYSTACK_CALLBACK_URL'),
      },
      {
        headers: { Authorization: `Bearer ${this.secret}` },
      },
    );

    const res = await firstValueFrom(observable);

    if (!res?.data?.status) {
      throw new BadRequestException('Paystack initialization failed');
    }

    return res.data.data;
  }

  async verify(reference: string) {
    const observable = this.http.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${this.secret}` },
      },
    );

    const res = await firstValueFrom(observable);

    if (!res?.data?.status) {
      throw new BadRequestException('Paystack verification failed');
    }

    return res.data.data;
  }
}
