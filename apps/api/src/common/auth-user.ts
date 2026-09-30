import type { Role } from '../generated/prisma/client';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  hospitalId: string | null;
};

