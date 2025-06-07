import { Injectable } from '@nestjs/common';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';

// Define an interface for your JWT payload
interface JwtPayload {
  sub: string;
  username: string;
  // add other properties as needed
}

@Injectable()
export class JwtGuardStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is not defined');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    console.log('payload', payload);
    return payload;
  }
}
