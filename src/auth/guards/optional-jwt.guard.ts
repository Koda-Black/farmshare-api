import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // Call parent canActivate, but don't throw on failure
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    // Return user if available, null otherwise
    // Don't throw on authentication failure
    return user || null;
  }
}
