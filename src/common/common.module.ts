// ============================================================================
// FILE: src/common/common.module.ts
// PURPOSE: Shared services and utilities module
// ============================================================================

import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SecurityService } from './services/security.service';
import { ScheduledTasksService } from './services/scheduled-tasks.service';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * CommonModule provides shared services across the application:
 * - SecurityService: Rate limiting, lockouts, replay prevention
 * - ScheduledTasksService: Periodic cleanup and maintenance
 *
 * Marked as @Global so these services are available everywhere
 */
@Global()
@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  providers: [SecurityService, ScheduledTasksService],
  exports: [SecurityService, ScheduledTasksService],
})
export class CommonModule {}
