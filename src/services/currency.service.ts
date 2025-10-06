import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class CurrencyService {
  async convertToUSD(ngn: number): Promise<number> {
    const res = await axios.get(
      `https://api.exchangerate.host/latest?base=NGN&symbols=USD`,
    );
    const rate = res.data.rates.USD;
    return ngn * rate;
  }
}
