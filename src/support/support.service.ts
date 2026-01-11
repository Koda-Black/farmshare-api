import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';

// System prompt that defines the AI assistant's behavior
const SYSTEM_PROMPT = `You are FarmShare's friendly AI support assistant. FarmShare is a Nigerian agricultural marketplace platform that connects farmers/vendors with buyers through bulk purchasing pools.

KEY PLATFORM FEATURES:
- Pool-based buying: Buyers join pools to purchase items at wholesale prices
- Verified vendors: All vendors go through verification (business registration, CAC documents)
- Secure payments: Escrow-protected payments via Paystack
- Delivery tracking: Real-time updates on order fulfillment
- Dispute resolution: Built-in system for handling issues

COMMON USER QUERIES:
1. How to join a pool
2. Payment issues
3. Delivery status
4. Vendor verification process
5. Refund/dispute process
6. Account issues

GUIDELINES:
- Be friendly, professional, and helpful
- If you cannot help with something, suggest contacting human support
- Never share sensitive user data
- For technical issues or account-specific problems, suggest they contact support@farmshare.ng
- Keep responses concise but informative
- If someone wants to file a dispute, guide them to the Disputes section in their dashboard

IMPORTANT: You can help with general platform questions, but for specific order issues, account problems, or payment disputes, users should be directed to human support or the appropriate platform feature.`;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(private prisma: PrismaService) {}

  async chat(
    userId: string | null,
    message: string,
    conversationHistory: ChatMessage[] = [],
  ): Promise<{ response: string; conversationHistory: ChatMessage[] }> {
    // Sanitize the input message
    const sanitizedMessage = this.sanitizeInput(message);

    // Build the conversation
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory,
      { role: 'user', content: sanitizedMessage },
    ];

    try {
      // Call OpenRouter API
      const response = await this.callOpenRouter(messages);

      // Update conversation history
      const updatedHistory: ChatMessage[] = [
        ...conversationHistory,
        { role: 'user', content: sanitizedMessage },
        { role: 'assistant', content: response },
      ];

      // Store chat log if user is authenticated
      if (userId) {
        await this.logChat(userId, sanitizedMessage, response);
      }

      return {
        response,
        conversationHistory: updatedHistory,
      };
    } catch (error) {
      this.logger.error('AI chat error:', error);
      throw error;
    }
  }

  private async callOpenRouter(messages: ChatMessage[]): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.APP_URL || 'https://farmshare.ng',
          'X-Title': 'FarmShare Support',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3.5-sonnet', // Using Claude as default
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          max_tokens: 1024,
          temperature: 0.7,
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.text();
      this.logger.error('OpenRouter API error:', errorData);
      throw new Error('Failed to get AI response');
    }

    const data = await response.json();
    return (
      data.choices[0]?.message?.content ||
      'Sorry, I could not generate a response.'
    );
  }

  private sanitizeInput(input: string): string {
    // Remove potential script injections
    let sanitized = input.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      '',
    );
    // Remove HTML tags
    sanitized = sanitized.replace(/<[^>]*>/g, '');
    // Limit length
    sanitized = sanitized.slice(0, 2000);
    // Trim whitespace
    sanitized = sanitized.trim();
    return sanitized;
  }

  private async logChat(
    userId: string,
    userMessage: string,
    aiResponse: string,
  ) {
    try {
      // You can create a ChatLog model in Prisma if you want to persist chats
      // For now, just log to console in development
      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug(
          `Chat log - User ${userId}: ${userMessage.slice(0, 50)}...`,
        );
      }
    } catch (error) {
      this.logger.warn('Failed to log chat:', error);
    }
  }

  // Quick responses for common queries (before hitting AI)
  getQuickResponse(message: string): string | null {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('refund') && lowerMessage.includes('how')) {
      return 'To request a refund, go to your Orders page, find the order, and click "Raise Dispute". Our team will review your case within 24-48 hours. For urgent matters, email support@farmshare.ng';
    }

    if (lowerMessage.includes('contact') && lowerMessage.includes('support')) {
      return 'You can reach our support team at support@farmshare.ng or call +234 XXX XXX XXXX during business hours (9am - 6pm WAT, Monday to Friday).';
    }

    if (lowerMessage.includes('payment') && lowerMessage.includes('failed')) {
      return 'If your payment failed, please check: 1) Your card has sufficient funds, 2) Your card is enabled for online transactions, 3) Try a different payment method. If issues persist, contact your bank or our support team.';
    }

    return null;
  }
}
