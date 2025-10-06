import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { ModifyRoleDto, PaginationDto } from './dto/modify-role.dto';
import { EmailService } from '../email/email.service';
import { Role } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async elevateSelf(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isAdmin: true, role: Role.ADMIN as 'ADMIN' },
    });
    await this.emailService.sendRoleChangedEmail(
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

    // Prevent removing last SUPERADMIN
    const totalSuperAdmins = await this.prisma.user.count({
      where: { role: 'SUPERADMIN' },
    });
    if (
      totalSuperAdmins === 1 &&
      currentRole === 'SUPERADMIN' &&
      newRole !== 'SUPERADMIN'
    ) {
      throw new ForbiddenException(
        'Cannot revoke the only remaining SUPERADMIN',
      );
    }

    // Set isAdmin flags
    let isAdmin = false;
    if (newRole === 'SUPERADMIN' || newRole === 'ADMIN') {
      isAdmin = true;
    }

    const updated = await this.prisma.user.update({
      where: { id: dto.userId },
      data: {
        role: newRole,
        isAdmin,
      },
    });

    await this.emailService.sendRoleChangedEmail(
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
