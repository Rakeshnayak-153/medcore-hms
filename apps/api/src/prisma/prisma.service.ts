import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not defined. Create a .env file from .env.example before starting the API.',
      );
    }

    const adapter = new PrismaPg({ connectionString });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({ adapter });
  }
}
