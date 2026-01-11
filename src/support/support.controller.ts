import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
} from '@nestjs/common';
import { SupportService } from './support.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

@ApiTags('Support')
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('chat')
  @HttpCode(200)
  @UseGuards(OptionalJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chat with AI support assistant' })
  async chat(
    @Req() req,
    @Body()
    body: {
      message: string;
      conversationHistory?: ChatMessage[];
    },
  ) {
    const userId = req.user?.userId || null;

    // Check for quick responses first
    const quickResponse = this.supportService.getQuickResponse(body.message);
    if (quickResponse) {
      const updatedHistory: ChatMessage[] = [
        ...(body.conversationHistory || []),
        { role: 'user', content: body.message },
        { role: 'assistant', content: quickResponse },
      ];
      return {
        response: quickResponse,
        conversationHistory: updatedHistory,
        isQuickResponse: true,
      };
    }

    // Otherwise, use AI
    return this.supportService.chat(
      userId,
      body.message,
      body.conversationHistory || [],
    );
  }
}
