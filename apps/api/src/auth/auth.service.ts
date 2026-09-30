import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../generated/prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import type { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LoginDto, RegisterDto } from './dto';

const REFRESH_TTL = 60 * 60 * 24 * 7;

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  user: AuthUser;
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<{
    user: AuthUser;
    otpHint?: string;
    message: string;
  }> {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) {
      throw new ConflictException({
        error: 'EMAIL_TAKEN',
        message: 'Email already registered',
      });
    }
    const hospital = await this.prisma.hospital.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    const hash = await bcrypt.hash(
      dto.password,
      Number(this.config.get('BCRYPT_COST') ?? 12),
    );
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash: hash,
        fullName: dto.fullName,
        phone: dto.phone,
        role: Role.PATIENT,
        hospitalId: hospital?.id,
        emailVerified: false,
      },
    });
    if (hospital) {
      const mrn = `MRN${Date.now().toString().slice(-8)}`;
      await this.prisma.patient.create({
        data: {
          userId: user.id,
          hospitalId: hospital.id,
          mrn,
          dateOfBirth: new Date('1995-01-01'),
          gender: 'unspecified',
        },
      });
    }
    const code = String(randomInt(100000, 999999));
    await this.prisma.otpCode.create({
      data: {
        email: user.email,
        code,
        purpose: 'verify-email',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    return {
      user: this.safeUser(user),
      otpHint: process.env.NODE_ENV === 'production' ? undefined : code,
      message: 'Account created. Verify email with the 6-digit OTP.',
    };
  }

  async verifyEmail(email: string, code: string): Promise<AuthTokens> {
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        email: email.toLowerCase(),
        purpose: 'verify-email',
        used: false,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.code !== code || otp.expiresAt < new Date()) {
      throw new BadRequestException({
        error: 'INVALID_OTP',
        message: 'Invalid or expired OTP',
      });
    }
    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { used: true },
    });
    const user = await this.prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { emailVerified: true },
    });
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { hospital: true, patient: true, doctor: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string | undefined): Promise<AuthTokens> {
    if (!refreshToken) {
      throw new UnauthorizedException({
        error: 'NO_REFRESH',
        message: 'Missing refresh token',
      });
    }
    let payload: { sub: string; deviceId: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET') ?? 'dev-refresh',
      });
    } catch {
      throw new UnauthorizedException({
        error: 'INVALID_REFRESH',
        message: 'Refresh token invalid',
      });
    }
    const key = `rt:${payload.sub}:${payload.deviceId}`;
    const stored = await this.redis.get(key);
    if (!stored || stored !== refreshToken) {
      throw new UnauthorizedException({
        error: 'ROTATED',
        message: 'Refresh token already used',
      });
    }
    await this.redis.del(key);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { hospital: true },
    });
    if (!user) throw new UnauthorizedException();
    return this.issueTokens(user, payload.deviceId);
  }

  async logout(
    userId: string,
    deviceId?: string,
  ): Promise<{ loggedOut: true }> {
    if (deviceId) await this.redis.del(`rt:${userId}:${deviceId}`);
    return { loggedOut: true };
  }

  async me(userId: string): Promise<
    AuthUser & {
      hospitalName: string | null;
      doctorId: string | null;
      patientId: string | null;
      permissions: Role[];
    }
  > {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { hospital: true, doctor: true, patient: true },
    });
    if (!user) throw new UnauthorizedException();
    return {
      ...this.safeUser(user),
      hospitalName: user.hospital?.name ?? null,
      doctorId: user.doctor?.id ?? null,
      patientId: user.patient?.id ?? null,
      permissions: [user.role],
    };
  }

  private async issueTokens(
    user: {
      id: string;
      email: string;
      fullName: string;
      role: Role;
      hospitalId: string | null;
    },
    deviceId: string = randomUUID(),
  ): Promise<AuthTokens> {
    const accessPayload = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      hospitalId: user.hospitalId,
    };
    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.get('JWT_ACCESS_SECRET') ?? 'dev-access',
      expiresIn: this.config.get('JWT_ACCESS_TTL') ?? '15m',
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, deviceId },
      {
        secret: this.config.get('JWT_REFRESH_SECRET') ?? 'dev-refresh',
        expiresIn: this.config.get('JWT_REFRESH_TTL') ?? '7d',
      },
    );
    await this.redis.set(
      `rt:${user.id}:${deviceId}`,
      refreshToken,
      REFRESH_TTL,
    );
    return {
      accessToken,
      refreshToken,
      deviceId,
      user: this.safeUser(user),
    };
  }

  private safeUser(user: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    hospitalId: string | null;
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      hospitalId: user.hospitalId,
    };
  }
}

