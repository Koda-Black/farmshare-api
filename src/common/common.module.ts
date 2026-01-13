// ============================================================================
// FILE: src/common/common.module.ts
// PURPOSE: Shared services and utilities module
// ============================================================================

import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { SecurityService } from './services/security.service';
import { ScheduledTasksService } from './services/scheduled-tasks.service';
import { RedisService } from './services/redis.service';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * CommonModule provides shared services across the application:
 * - SecurityService: Rate limiting, lockouts, replay prevention
 * - ScheduledTasksService: Periodic cleanup and maintenance
 * - RedisService: Shared Redis connection manager
 *
 * Marked as @Global so these services are available everywhere
 */
@Global()
@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, ConfigModule],
  providers: [SecurityService, ScheduledTasksService, RedisService],
  exports: [SecurityService, ScheduledTasksService, RedisService],
})
export class CommonModule {}
