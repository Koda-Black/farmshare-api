import { Module } from '@nestjs/common';
import { PoolsService } from './pools.service';
import { PoolsController } from './pools.controller';
import { PrismaModule } from '../../prisma/prisma.module'; // Adjust path if needed

@Module({
  imports: [PrismaModule],
  controllers: [PoolsController],
  providers: [PoolsService],
})
export class PoolsModule {}
