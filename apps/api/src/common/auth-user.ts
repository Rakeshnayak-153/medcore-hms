import type { Role } from '@prisma/client';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  hospitalId: string | null;
};
