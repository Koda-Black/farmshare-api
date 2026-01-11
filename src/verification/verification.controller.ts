import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  Req,
} from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { VerificationService } from './verification.service';
import { PaystackVerificationService } from './services/paystack-verification.service';
import { FaceVerificationService } from './services/face-verification.service';
import { DocumentOcrService } from './services/document-ocr.service';
import { CacVerificationService } from './services/cac-verification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../constant';
import {
  StartVerificationDto,
  SubmitVerificationDto,
  OverrideVerificationDto,
} from './dto/start-verification.dto';
import { VerifyBankDto } from './dto/verify-bank.dto';
import { VerifyFaceDto } from './dto/verify-face.dto';
import { VerifyDocumentDto } from './dto/verify-document.dto';
import { VerifyCacDto } from './dto/verify-cac.dto';
import {
  ApiBearerAuth,
  ApiTags,
  ApiConsumes,
  ApiBody,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('Verification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('verification')
export class VerificationController {
  constructor(
    private verificationService: VerificationService,
    private paystackService: PaystackVerificationService,
    private faceService: FaceVerificationService,
    private documentOcrService: DocumentOcrService,
    private cacService: CacVerificationService,
  ) {}

  // ============================================================================
  // MAIN VERIFICATION FLOW ENDPOINTS
  // ============================================================================

  @Post('start')
  @ApiOperation({ summary: 'Start verification process for a user' })
  @ApiResponse({
    status: 200,
    description: 'Verification started successfully',
  })
  async startVerification(@Body() dto: StartVerificationDto, @Req() req) {
    return this.verificationService.startVerification(
      dto.userId || req.user.userId,
      dto.steps,
    );
  }

  @Post('submit')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Submit verification documents' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        verificationId: { type: 'string' },
        metadata: { type: 'object' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  async submitVerification(
    @Body() dto: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req,
  ) {
    return this.verificationService.submitVerification(
      dto.verificationId,
      files,
      dto.metadata ? JSON.parse(dto.metadata) : {},
      req.user.userId,
    );
  }

  @Get('status')
  @ApiOperation({ summary: 'Get verification status for a user' })
  async getVerificationStatus(@Query('userId') userId: string, @Req() req) {
    return this.verificationService.getVerificationStatus(
      userId || req.user.userId,
    );
  }

  // ============================================================================
  // INDIVIDUAL VERIFICATION SERVICE ENDPOINTS
  // ============================================================================

  @Post('bank')
  @ApiOperation({ summary: 'Verify Nigerian bank account using Paystack' })
  @ApiResponse({
    status: 200,
    description: 'Bank account verified successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        accountName: { type: 'string' },
        accountNumber: { type: 'string' },
        bankCode: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid account details' })
  async verifyBankAccount(@Body() dto: VerifyBankDto) {
    return this.paystackService.verifyBankAccount(
      dto.accountNumber,
      dto.bankCode,
    );
  }

  @Get('banks')
  @ApiOperation({ summary: 'Get list of supported Nigerian banks' })
  @ApiResponse({
    status: 200,
    description: 'List of supported banks',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
          code: { type: 'string' },
          active: { type: 'boolean' },
        },
      },
    },
  })
  async getSupportedBanks() {
    return this.paystackService.getSupportedBanks();
  }

  @Post('face')
  @ApiOperation({
    summary: 'Verify face match between selfie and ID document',
  })
  @ApiResponse({
    status: 200,
    description: 'Face verification result',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        confidence: { type: 'number' },
        facesDetected: { type: 'number' },
        message: { type: 'string' },
      },
    },
  })
  async verifyFace(@Body() dto: VerifyFaceDto) {
    return this.faceService.verifyFace(
      dto.selfieImage,
      dto.idCardImage,
      dto.confidenceThreshold,
    );
  }

  @Post('document/ocr')
  @UseInterceptors(FileInterceptor('document'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Extract data from government ID document using OCR',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['document'],
      properties: {
        document: {
          type: 'string',
          format: 'binary',
          description: 'Government ID document image (JPEG, PNG)',
        },
        documentType: {
          type: 'string',
          enum: ['NIN', 'PASSPORT', 'DRIVERS_LICENSE', 'VOTER_CARD'],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Document data extracted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        fullName: { type: 'string' },
        documentNumber: { type: 'string' },
        dateOfBirth: { type: 'string' },
        documentType: { type: 'string' },
        confidence: { type: 'number' },
        message: { type: 'string' },
      },
    },
  })
  async extractDocumentData(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: VerifyDocumentDto,
  ) {
    if (!file) {
      return {
        success: false,
        error: 'No file uploaded',
        message: 'Please upload a document image',
      };
    }

    return this.documentOcrService.extractDocumentData(file.buffer);
  }

  @Post('cac')
  @ApiOperation({
    summary: 'Verify Nigerian business registration with CAC',
  })
  @ApiResponse({
    status: 200,
    description: 'Business verification result',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        companyName: { type: 'string' },
        registrationNumber: { type: 'string' },
        registrationDate: { type: 'string' },
        businessType: { type: 'string' },
        status: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  async verifyBusinessRegistration(@Body() dto: VerifyCacDto) {
    return this.cacService.verifyBusinessRegistration(
      dto.registrationNumber,
      dto.companyName,
    );
  }

  // ============================================================================
  // ADMIN ENDPOINTS
  // ============================================================================

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/override')
  @ApiOperation({ summary: 'Admin: Override verification status' })
  async overrideVerification(@Body() dto: OverrideVerificationDto) {
    return this.verificationService.adminOverride(
      dto.userId,
      dto.status,
      dto.reason,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/pending')
  @ApiOperation({ summary: 'Admin: Get pending verifications' })
  async getPendingVerifications(
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 20,
  ) {
    return this.verificationService.getPendingVerifications(skip, take);
  }

  // ============================================================================
  // HEALTH CHECK ENDPOINTS
  // ============================================================================

  @Get('health')
  @ApiOperation({ summary: 'Health check for all verification services' })
  async healthCheck() {
    const [paystack, face, cac] = await Promise.all([
      this.paystackService.healthCheck(),
      this.faceService.healthCheck(),
      this.cacService.healthCheck(),
    ]);

    return {
      success: true,
      services: {
        paystack: { status: paystack ? 'healthy' : 'unavailable' },
        faceVerification: { status: face ? 'healthy' : 'unavailable' },
        cacVerification: { status: cac ? 'healthy' : 'unavailable' },
        documentOcr: { status: 'healthy' }, // OCR is always available (local)
      },
      timestamp: new Date().toISOString(),
    };
  }
}
