import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { EmailChannelService } from '../notifications/channels/email.channel';
import {
  SubscribeNewsletterDto,
  UnsubscribeNewsletterDto,
  SendNewsletterDto,
} from './dto/newsletter.dto';

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(
    private prisma: PrismaService,
    private emailChannel: EmailChannelService,
  ) {}

  async subscribe(dto: SubscribeNewsletterDto) {
    const { email, name, source, tags } = dto;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if already subscribed
    const existing = await this.prisma.newsletterSubscriber.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      // If they were unsubscribed, reactivate
      if (!existing.isActive) {
        const updated = await this.prisma.newsletterSubscriber.update({
          where: { email: normalizedEmail },
          data: {
            isActive: true,
            unsubscribedAt: null,
            name: name || existing.name,
            source: source || existing.source,
            tags: tags || existing.tags,
          },
        });
        this.logger.log(
          `Reactivated newsletter subscription for ${normalizedEmail}`,
        );
        return {
          message: 'Welcome back! Your subscription has been reactivated.',
          subscriber: updated,
        };
      }

      throw new ConflictException(
        'This email is already subscribed to our newsletter.',
      );
    }

    // Create new subscription
    const subscriber = await this.prisma.newsletterSubscriber.create({
      data: {
        email: normalizedEmail,
        name,
        source: source || 'footer',
        tags: tags || [],
      },
    });

    this.logger.log(`New newsletter subscription: ${normalizedEmail}`);

    return {
      message: 'Successfully subscribed to our newsletter!',
      subscriber,
    };
  }

  async unsubscribe(dto: UnsubscribeNewsletterDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const existing = await this.prisma.newsletterSubscriber.findUnique({
      where: { email: normalizedEmail },
    });

    if (!existing) {
      throw new NotFoundException('Email not found in our newsletter list.');
    }

    if (!existing.isActive) {
      return { message: 'This email is already unsubscribed.' };
    }

    await this.prisma.newsletterSubscriber.update({
      where: { email: normalizedEmail },
      data: {
        isActive: false,
        unsubscribedAt: new Date(),
      },
    });

    this.logger.log(`Newsletter unsubscription: ${normalizedEmail}`);

    return { message: 'Successfully unsubscribed from our newsletter.' };
  }

  async getAllSubscribers(
    page: number = 1,
    limit: number = 50,
    activeOnly: boolean = true,
  ) {
    const skip = (page - 1) * limit;

    const where = activeOnly ? { isActive: true } : {};

    const [subscribers, total] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({
        where,
        orderBy: { subscribedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);

    return {
      subscribers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + subscribers.length < total,
      },
    };
  }

  async getStats() {
    const [totalActive, totalInactive, recentSubscribers] = await Promise.all([
      this.prisma.newsletterSubscriber.count({ where: { isActive: true } }),
      this.prisma.newsletterSubscriber.count({ where: { isActive: false } }),
      this.prisma.newsletterSubscriber.count({
        where: {
          isActive: true,
          subscribedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
    ]);

    return {
      totalActive,
      totalInactive,
      total: totalActive + totalInactive,
      recentSubscribers,
      growthRate:
        totalActive > 0
          ? ((recentSubscribers / totalActive) * 100).toFixed(2)
          : 0,
    };
  }

  async deleteSubscriber(email: string) {
    const normalizedEmail = email.toLowerCase().trim();

    await this.prisma.newsletterSubscriber.delete({
      where: { email: normalizedEmail },
    });

    this.logger.log(
      `Permanently deleted newsletter subscriber: ${normalizedEmail}`,
    );

    return { message: 'Subscriber permanently deleted.' };
  }

  async sendNewsletter(dto: SendNewsletterDto) {
    const { subject, htmlContent, textContent, targetTags, testMode } = dto;

    // Get subscribers to send to
    let whereClause: any = { isActive: true };

    if (targetTags && targetTags.length > 0) {
      whereClause = {
        ...whereClause,
        tags: { hasSome: targetTags },
      };
    }

    const subscribers = await this.prisma.newsletterSubscriber.findMany({
      where: whereClause,
      select: { email: true, name: true },
    });

    if (testMode) {
      // In test mode, just return what would be sent
      return {
        message: 'Test mode - newsletter not sent',
        subject,
        recipientCount: subscribers.length,
        testRecipients: subscribers.slice(0, 5).map((s) => s.email),
        htmlPreview: htmlContent.substring(0, 500) + '...',
      };
    }

    // Send emails in batches to avoid rate limits
    const batchSize = 50;
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < subscribers.length; i += batchSize) {
      const batch = subscribers.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (subscriber) => {
          try {
            await this.emailChannel.sendCustomEmail(
              subscriber.email,
              subject,
              htmlContent,
              textContent,
            );
            sentCount++;
          } catch (error) {
            this.logger.error(
              `Failed to send newsletter to ${subscriber.email}:`,
              error,
            );
            failedCount++;
          }
        }),
      );

      // Small delay between batches
      if (i + batchSize < subscribers.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    this.logger.log(
      `Newsletter sent: ${sentCount} successful, ${failedCount} failed`,
    );

    return {
      message: 'Newsletter sent successfully',
      subject,
      sentCount,
      failedCount,
      totalRecipients: subscribers.length,
    };
  }
}
