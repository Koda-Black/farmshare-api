import {
  UseGuards,
  Req,
  Res,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { GoogleOauthGuard } from './guards/google-oauth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post()
  create(@Body() createAuthDto: CreateAuthDto) {
    return this.authService.create(createAuthDto);
  }

  @Get()
  findAll() {
    return this.authService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.authService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAuthDto: UpdateAuthDto) {
    return this.authService.update(+id, updateAuthDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.authService.remove(+id);
  }

  @Get('google/callback')
  @UseGuards(GoogleOauthGuard)
  async googleAuthCallback(
    @Req() req: Request & { user: { email: string; name: string } },
    @Res() res: Response,
  ) {
    try {
      const token = await this.authService.oAuthLogin(req.user);
      const redirectBase = process.env.FRONTEND_BASE_URL;
      if (!redirectBase) {
        throw new Error('FRONTEND_BASE_URL is not defined');
      }
      res.redirect(`${redirectBase}/oauth?token=${token.jwt}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      res.status(500).send({ success: false, message });
    }
  }
}
