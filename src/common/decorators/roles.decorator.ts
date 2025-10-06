// src/common/decorators/roles.decorator.ts
// import { Reflector } from '@nestjs/core';

import { SetMetadata } from '@nestjs/common';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
