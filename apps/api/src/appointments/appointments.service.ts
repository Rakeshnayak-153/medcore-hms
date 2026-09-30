import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, AppointmentType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  async list(
    user: AuthUser,
    query: { date?: string; status?: AppointmentStatus },
  ) {
    if (user.role !== 'SUPER_ADMIN' && !user.hospitalId) {
      throw new ForbiddenException({
        error: 'HOSPITAL_SCOPE_REQUIRED',
        message: 'A hospital assignment is required to list appointments.',
      });
    }
    const where: Prisma.AppointmentWhereInput = {
      deletedAt: null,
      ...(user.role !== 'SUPER_ADMIN' ? { hospitalId: user.hospitalId! } : {}),
    };
    if (query.status) where.status = query.status;
    if (query.date) {
      const start = new Date(`${query.date}T00:00:00.000Z`);
      const end = new Date(`${query.date}T23:59:59.999Z`);
      where.startsAt = { gte: start, lte: end };
    }
    if (user.role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor) return [];
      where.doctorId = doctor.id;
    }
    if (user.role === 'PATIENT') {
      const patient = await this.prisma.patient.findUnique({
        where: { userId: user.id },
      });
      if (!patient) return [];
      where.patientId = patient.id;
    }
    return this.prisma.appointment.findMany({
      where,
      include: {
        doctor: { include: { user: true, department: true } },
        patient: { include: { user: true } },
        department: true,
      },
      orderBy: { startsAt: 'asc' },
      take: 200,
    });
  }

  async book(
    user: AuthUser,
    dto: {
      doctorId: string;
      patientId?: string;
      startsAt: string;
      reason?: string;
      emergency?: boolean;
    },
  ) {
    if (dto.emergency && user.role === 'PATIENT') {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'Patients cannot bypass doctor availability checks.',
      });
    }

    const doctor = await this.prisma.doctor.findUnique({
      where: { id: dto.doctorId },
      include: { department: true },
    });
    if (!doctor)
      throw new NotFoundException({
        error: 'DOCTOR_NOT_FOUND',
        message: 'Doctor not found',
      });
    if (
      user.role !== 'SUPER_ADMIN' &&
      (!user.hospitalId || doctor.department.hospitalId !== user.hospitalId)
    ) {
      throw new NotFoundException();
    }

    let patientId = dto.patientId;
    if (user.role === 'PATIENT') {
      const self = await this.prisma.patient.findUnique({
        where: { userId: user.id },
      });
      if (!self) throw new BadRequestException('Patient profile missing');
      patientId = self.id;
    }
    if (!patientId) throw new BadRequestException('patientId is required');

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (
      !patient ||
      patient.hospitalId !== doctor.department.hospitalId ||
      (user.role !== 'SUPER_ADMIN' && patient.hospitalId !== user.hospitalId)
    ) {
      throw new NotFoundException();
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

    const clash = await this.prisma.$transaction(async (tx) => {
      const doctorBusy = await tx.appointment.findFirst({
        where: {
          doctorId: doctor.id,
          deletedAt: null,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      });
      if (doctorBusy && !dto.emergency) {
        throw new ConflictException({
          error: 'SLOT_UNAVAILABLE',
          message: 'This slot was just booked by another patient.',
        });
      }
      const patientBusy = await tx.appointment.findFirst({
        where: {
          patientId,
          deletedAt: null,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      });
      if (patientBusy) {
        throw new ConflictException({
          error: 'PATIENT_BUSY',
          message: 'Patient already has an appointment at this time.',
        });
      }
      return tx.appointment.create({
        data: {
          hospitalId: doctor.department.hospitalId,
          doctorId: doctor.id,
          patientId,
          departmentId: doctor.departmentId,
          startsAt,
          endsAt,
          reason: dto.reason,
          type: dto.emergency
            ? AppointmentType.EMERGENCY
            : AppointmentType.REGULAR,
          status: dto.emergency
            ? AppointmentStatus.CONFIRMED
            : AppointmentStatus.PENDING,
        },
        include: {
          doctor: { include: { user: true } },
          patient: { include: { user: true } },
        },
      });
    });
    return clash;
  }

  async updateStatus(id: string, status: AppointmentStatus, user: AuthUser) {
    const appt = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException();
    if (
      user.role !== 'SUPER_ADMIN' &&
      (!user.hospitalId || appt.hospitalId !== user.hospitalId)
    ) {
      throw new NotFoundException();
    }
    if (user.role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor || appt.doctorId !== doctor.id) throw new NotFoundException();
    }
    return this.prisma.appointment.update({
      where: { id },
      data: { status },
      include: {
        doctor: { include: { user: true } },
        patient: { include: { user: true } },
      },
    });
  }

  async slots(doctorId: string, date: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: { availability: true },
    });
    if (!doctor) throw new NotFoundException();
    const day = new Date(`${date}T12:00:00.000Z`);
    const weekday = day.getUTCDay();
    const windows = doctor.availability.filter((a) => a.weekday === weekday);
    const booked = await this.prisma.appointment.findMany({
      where: {
        doctorId,
        deletedAt: null,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        startsAt: {
          gte: new Date(`${date}T00:00:00.000Z`),
          lte: new Date(`${date}T23:59:59.999Z`),
        },
      },
    });
    const bookedSet = new Set(booked.map((b) => b.startsAt.toISOString()));
    const slots: { start: string; available: boolean }[] = [];
    for (const win of windows) {
      const [sh, sm] = win.startTime.split(':').map(Number);
      const [eh, em] = win.endTime.split(':').map(Number);
      let cursor = new Date(`${date}T${win.startTime}:00.000Z`);
      const end = new Date(
        `${date}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00.000Z`,
      );
      while (cursor < end) {
        const next = new Date(cursor.getTime() + win.slotMins * 60 * 1000);
        slots.push({
          start: cursor.toISOString(),
          available: !bookedSet.has(cursor.toISOString()),
        });
        cursor = next;
        void sh;
        void sm;
      }
    }
    return slots;
  }
}

