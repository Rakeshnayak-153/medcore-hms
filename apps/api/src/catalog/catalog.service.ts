import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  private requireHospitalScope(user: AuthUser) {
    if (user.role !== 'SUPER_ADMIN' && !user.hospitalId) {
      throw new ForbiddenException({
        error: 'HOSPITAL_SCOPE_REQUIRED',
        message: 'A hospital assignment is required to access this catalog.',
      });
    }
  }

  hospitals() {
    return this.prisma.hospital.findMany({
      include: { address: true, departments: true },
    });
  }

  departments(hospitalId: string, user: AuthUser) {
    this.requireHospitalScope(user);
    if (user.role !== 'SUPER_ADMIN' && user.hospitalId !== hospitalId) {
      throw new NotFoundException();
    }
    return this.prisma.department.findMany({ where: { hospitalId } });
  }

  doctors(
    user: AuthUser,
    requestedHospitalId?: string,
    specialisation?: string,
  ) {
    this.requireHospitalScope(user);
    if (
      user.role !== 'SUPER_ADMIN' &&
      requestedHospitalId &&
      requestedHospitalId !== user.hospitalId
    ) {
      throw new NotFoundException();
    }
    const hospitalId =
      user.role === 'SUPER_ADMIN' ? requestedHospitalId : user.hospitalId!;
    return this.prisma.doctor.findMany({
      where: {
        deletedAt: null,
        ...(hospitalId ? { department: { hospitalId } } : {}),
        ...(specialisation
          ? {
              specialisation: { contains: specialisation, mode: 'insensitive' },
            }
          : {}),
      },
      include: { user: true, department: true, availability: true },
    });
  }

  async patients(user: AuthUser, search?: string) {
    if (user.role === 'PATIENT') {
      return this.prisma.patient.findMany({
        where: { userId: user.id },
        include: { user: true, address: true },
      });
    }
    this.requireHospitalScope(user);
    return this.prisma.patient.findMany({
      where: {
        deletedAt: null,
        ...(user.role !== 'SUPER_ADMIN'
          ? { hospitalId: user.hospitalId! }
          : {}),
        ...(search
          ? {
              OR: [
                { mrn: { contains: search, mode: 'insensitive' } },
                {
                  user: { fullName: { contains: search, mode: 'insensitive' } },
                },
              ],
            }
          : {}),
      },
      include: { user: true },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
  }

  async patientById(id: string, user: AuthUser) {
    if (
      !['PATIENT', 'DOCTOR', 'NURSE', 'HOSPITAL_ADMIN', 'SUPER_ADMIN'].includes(
        user.role,
      )
    ) {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'You do not have permission to view detailed patient records.',
      });
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        user: true,
        address: true,
        appointments: {
          orderBy: { startsAt: 'desc' },
          take: 10,
          include: { doctor: { include: { user: true } } },
        },
        medicalRecords: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!patient) throw new NotFoundException();
    if (user.role === 'PATIENT' && patient.userId !== user.id) {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'Cannot view another patient record',
      });
    }
    if (
      user.role !== 'SUPER_ADMIN' &&
      (!user.hospitalId || patient.hospitalId !== user.hospitalId)
    ) {
      throw new ForbiddenException({
        error: 'TENANT_ISOLATION',
        message: 'Cross-hospital access denied',
      });
    }
    return patient;
  }

  medicines(user: AuthUser, search?: string) {
    this.requireHospitalScope(user);
    return this.prisma.medicine.findMany({
      where: {
        ...(user.role !== 'SUPER_ADMIN'
          ? { hospitalId: user.hospitalId! }
          : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: { batches: true },
      take: 100,
    });
  }

  search(user: AuthUser, q: string) {
    this.requireHospitalScope(user);
    const hospitalId =
      user.role === 'SUPER_ADMIN' ? undefined : (user.hospitalId ?? undefined);
    return Promise.all([
      this.prisma.patient.findMany({
        where: {
          ...(hospitalId ? { hospitalId } : {}),
          ...(user.role === 'PATIENT' ? { userId: user.id } : {}),
          OR: [
            { mrn: { contains: q, mode: 'insensitive' } },
            { user: { fullName: { contains: q, mode: 'insensitive' } } },
          ],
        },
        include: { user: true },
        take: 8,
      }),
      this.prisma.doctor.findMany({
        where: {
          ...(hospitalId ? { department: { hospitalId } } : {}),
          user: { fullName: { contains: q, mode: 'insensitive' } },
        },
        include: { user: true, department: true },
        take: 8,
      }),
      this.prisma.medicine.findMany({
        where: {
          ...(hospitalId ? { hospitalId } : {}),
          name: { contains: q, mode: 'insensitive' },
        },
        take: 8,
      }),
    ]).then(([patients, doctors, medicines]) => ({
      patients,
      doctors,
      medicines,
    }));
  }
}
