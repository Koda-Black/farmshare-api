import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import {
  AdminSignupDto,
  AdminLoginDto,
  EnableMfaDto,
  VerifyMfaDto,
  DisableMfaDto,
} from './dto/admin-auth.dto';
import {
  UpdateUserDto,
  SearchUsersDto,
  BanUserDto,
  UnbanUserDto,
  SetProbationDto,
  RemoveProbationDto,
} from './dto/user-management.dto';
import {
  GetPendingVerificationsDto,
  ApproveVerificationDto,
  RejectVerificationDto,
  GetVerificationDetailsDto,
} from './dto/verification-review.dto';
import {
  GetDisputesDto,
  UpdateDisputeStatusDto,
  ResolveDisputeDto,
  GetDisputeDetailsDto,
} from './dto/dispute-management.dto';
import {
  GetPayoutsDto,
  InitiatePayoutDto,
  SimulatePayoutDto,
  GetVendorPayoutStatsDto,
} from './dto/payout-management.dto';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  // ==================== AUTHENTICATION ====================

  @Post('signup')
  @ApiOperation({ summary: 'Admin signup with secret key' })
  @ApiResponse({ status: 201, description: 'Admin account created' })
  adminSignup(@Body() dto: AdminSignupDto) {
    return this.adminService.adminSignup(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Admin login (with optional MFA)' })
  @ApiResponse({ status: 200, description: 'Login successful or MFA required' })
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.adminService.adminLogin(dto);
  }

  @Post('login/mfa')
  @ApiOperation({ summary: 'Verify MFA code during login' })
  @ApiResponse({ status: 200, description: 'MFA verified and logged in' })
  verifyMfaLogin(@Body() dto: VerifyMfaDto) {
    return this.adminService.verifyMfaLogin(dto);
  }

  @Post('mfa/enable')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Enable MFA - Get QR code' })
  @ApiResponse({ status: 200, description: 'QR code generated' })
  enableMfa(@Req() req) {
    return this.adminService.enableMfa(req.user.userId);
  }

  @Post('mfa/confirm')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Confirm and enable MFA with verification code' })
  @ApiResponse({ status: 200, description: 'MFA enabled successfully' })
  confirmEnableMfa(@Req() req, @Body() dto: EnableMfaDto) {
    return this.adminService.confirmEnableMfa(req.user.userId, dto);
  }

  @Post('mfa/disable')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Disable MFA for admin account' })
  @ApiResponse({ status: 200, description: 'MFA disabled successfully' })
  disableMfa(@Req() req, @Body() dto: DisableMfaDto) {
    return this.adminService.disableMfa(req.user.userId, dto);
  }

  // ==================== DASHBOARD ====================

  @Get('dashboard')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get admin dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard statistics returned' })
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('metrics/revenue')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get revenue metrics for charts' })
  @ApiResponse({ status: 200, description: 'Revenue metrics returned' })
  getRevenueMetrics(@Query('period') period: string = 'week') {
    return this.adminService.getRevenueMetrics(period);
  }

  @Get('metrics/user-growth')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get user growth metrics for charts' })
  @ApiResponse({ status: 200, description: 'User growth metrics returned' })
  getUserGrowthMetrics(@Query('period') period: string = 'month') {
    return this.adminService.getUserGrowthMetrics(period);
  }

  @Get('metrics/pool-distribution')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get pool distribution metrics for charts' })
  @ApiResponse({
    status: 200,
    description: 'Pool distribution metrics returned',
  })
  getPoolDistributionMetrics() {
    return this.adminService.getPoolDistributionMetrics();
  }

  // ==================== USER MANAGEMENT ====================

  @Get('users')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Search and list users with filters' })
  @ApiResponse({ status: 200, description: 'Users list returned' })
  searchUsers(@Query() dto: SearchUsersDto) {
    return this.adminService.searchUsers(dto);
  }

  @Get('users/:userId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get detailed user information' })
  @ApiResponse({ status: 200, description: 'User details returned' })
  getUserDetails(@Param('userId') userId: string) {
    return this.adminService.getUserDetails(userId);
  }

  @Patch('users/:userId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update user information' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  updateUser(@Req() req, @Param('userId') userId: string, @Body() dto: any) {
    return this.adminService.updateUser(req.user.userId, {
      userId,
      ...dto,
    });
  }

  @Post('users/ban')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ban a user' })
  @ApiResponse({ status: 200, description: 'User banned successfully' })
  banUser(@Req() req, @Body() dto: BanUserDto) {
    return this.adminService.banUser(req.user.userId, dto);
  }

  @Post('users/unban')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Unban a user' })
  @ApiResponse({ status: 200, description: 'User unbanned successfully' })
  unbanUser(@Req() req, @Body() dto: UnbanUserDto) {
    return this.adminService.unbanUser(req.user.userId, dto);
  }

  @Post('users/probation')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Set user on probation' })
  @ApiResponse({
    status: 200,
    description: 'User set on probation successfully',
  })
  setProbation(@Req() req, @Body() dto: SetProbationDto) {
    return this.adminService.setProbation(req.user.userId, dto);
  }

  @Post('users/probation/remove')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Remove user from probation' })
  @ApiResponse({
    status: 200,
    description: 'User removed from probation successfully',
  })
  removeProbation(@Req() req, @Body() dto: RemoveProbationDto) {
    return this.adminService.removeProbation(req.user.userId, dto);
  }

  // ==================== VERIFICATION REVIEW ====================

  @Get('verifications/pending')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get pending verifications for review' })
  @ApiResponse({ status: 200, description: 'Pending verifications returned' })
  getPendingVerifications(@Query() dto: GetPendingVerificationsDto) {
    return this.adminService.getPendingVerifications(dto);
  }

  @Get('verifications/user/:userId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get verification details for a user' })
  @ApiResponse({ status: 200, description: 'Verification details returned' })
  getVerificationDetails(@Param('userId') userId: string) {
    return this.adminService.getVerificationDetails({ userId });
  }

  @Post('verifications/approve')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Approve a verification' })
  @ApiResponse({ status: 200, description: 'Verification approved' })
  approveVerification(@Req() req, @Body() dto: ApproveVerificationDto) {
    return this.adminService.approveVerification(req.user.userId, dto);
  }

  @Post('verifications/reject')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reject a verification' })
  @ApiResponse({ status: 200, description: 'Verification rejected' })
  rejectVerification(@Req() req, @Body() dto: RejectVerificationDto) {
    return this.adminService.rejectVerification(req.user.userId, dto);
  }

  // ==================== DISPUTE MANAGEMENT ====================

  @Get('disputes')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get disputes for admin review' })
  @ApiResponse({ status: 200, description: 'Disputes list returned' })
  getDisputes(@Query() dto: GetDisputesDto) {
    return this.adminService.getDisputes(dto);
  }

  @Get('disputes/:disputeId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get dispute details' })
  @ApiResponse({ status: 200, description: 'Dispute details returned' })
  getDisputeDetails(@Param('disputeId') disputeId: string) {
    return this.adminService.getDisputeDetails({ disputeId });
  }

  @Patch('disputes/:disputeId/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update dispute status' })
  @ApiResponse({ status: 200, description: 'Dispute status updated' })
  updateDisputeStatus(
    @Req() req,
    @Param('disputeId') disputeId: string,
    @Body() dto: any,
  ) {
    return this.adminService.updateDisputeStatus(req.user.userId, {
      disputeId,
      ...dto,
    });
  }

  @Post('disputes/:disputeId/resolve')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Resolve dispute with escrow distribution' })
  @ApiResponse({ status: 200, description: 'Dispute resolved' })
  resolveDispute(
    @Req() req,
    @Param('disputeId') disputeId: string,
    @Body() dto: any,
  ) {
    return this.adminService.resolveDispute(req.user.userId, {
      disputeId,
      ...dto,
    });
  }

  // ==================== PAYOUT MANAGEMENT ====================

  @Get('payouts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all payouts with filtering' })
  @ApiResponse({ status: 200, description: 'List of payouts' })
  getPayouts(@Query() dto: GetPayoutsDto) {
    return this.adminService.getPayouts(dto);
  }

  @Get('payouts/stats')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get vendor payout statistics' })
  @ApiResponse({ status: 200, description: 'Payout statistics' })
  getVendorPayoutStats(@Query() dto: GetVendorPayoutStatsDto) {
    return this.adminService.getVendorPayoutStats(dto);
  }

  @Post('payouts/simulate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Simulate payout calculation for a pool' })
  @ApiResponse({ status: 200, description: 'Payout simulation result' })
  simulatePayout(@Body() dto: SimulatePayoutDto) {
    return this.adminService.simulatePayout(dto);
  }

  @Post('payouts/initiate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Initiate payout to vendor' })
  @ApiResponse({ status: 200, description: 'Payout initiated' })
  initiatePayout(@Req() req, @Body() dto: InitiatePayoutDto) {
    return this.adminService.initiatePayout(req.user.userId, dto);
  }
}
