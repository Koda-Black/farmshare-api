// src/middleware/raw-body.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response } from 'express';
import * as getRawBody from 'raw-body';

@Injectable()
export class RawBodyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: () => void) {
    getRawBody(req, (err, body) => {
      if (err) {
        next();
        return;
      }
      req['rawBody'] = body;
      next();
    });
  }
}
