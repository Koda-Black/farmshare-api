import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { ModifyRoleDto, PaginationDto } from './dto/modify-role.dto';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { Role } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private emailChannel: EmailChannelService,
  ) {}

  async elevateSelf(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { role: Role.ADMIN },
    });
    await this.emailChannel.sendRoleChangedEmail(
      user.email,
      user.name,
      user.role,
    );
    return user;
  }

  async modifyUserRole(dto: ModifyRoleDto) {
    const target = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!target) throw new NotFoundException('User not found');

    const currentRole = target.role;
    const newRole = dto.newRole;

    const updated = await this.prisma.user.update({
      where: { id: dto.userId },
      data: {
        role: newRole as Role,
      },
    });

    await this.emailChannel.sendRoleChangedEmail(
      updated.email,
      updated.name,
      updated.role,
    );
    return updated;
  }

  async getUsersWithRoles(query: PaginationDto) {
    const { skip, take } = query;
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        skip,
        take,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count(),
    ]);
    return { total, users };
  }
}
