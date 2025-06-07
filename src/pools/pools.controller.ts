import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PoolsService } from './pools.service';
import { CreatePoolDto } from './dto/create-pool.dto';
import { SubscribeDto } from './dto/subscribe.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Adjust path if needed

@Controller('pools')
export class PoolsController {
  constructor(private readonly poolsService: PoolsService) {}

  @Post()
  @UseGuards(JwtAuthGuard) // Protect this route
  create(@Body() createPoolDto: CreatePoolDto) {
    return this.poolsService.create(createPoolDto);
  }

  @Get()
  findAll() {
    return this.poolsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.poolsService.findOne(id);
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  subscribe(@Req() req, @Body() subscribeDto: SubscribeDto) {
    const userId = req.user.userId; // Assuming your JWT payload has userId
    return this.poolsService.subscribe(userId, subscribeDto);
  }

  @Get('user/subscriptions')
  @UseGuards(JwtAuthGuard)
  getUserSubscriptions(@Req() req) {
    const userId = req.user.userId;
    return this.poolsService.getUserSubscriptions(userId);
  }
}
