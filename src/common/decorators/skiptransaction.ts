// src/common/decorators.ts
import { SetMetadata } from '@nestjs/common';

export const SKIP_TRANSACTION_KEY = 'skipTransaction';
export const SkipTransaction = () => SetMetadata(SKIP_TRANSACTION_KEY, true);