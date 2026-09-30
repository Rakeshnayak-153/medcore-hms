import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LabOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';

@Injectable()
export class ClinicalService {
  constructor(private prisma: PrismaService) {}

  async createRecord(
    user: AuthUser,
    dto: {
      appointmentId: string;
      bpSystolic?: number;
      bpDiastolic?: number;
      pulse?: number;
      temperatureC?: number;
      spo2?: number;
      heightCm?: number;
      weightKg?: number;
      chiefComplaint?: string;
      symptoms?: string;
      diagnosis?: string;
      icd10?: string;
      treatmentPlan?: string;
      allergies?: string;
      familyHistory?: string;
      notes?: string;
    },
  ) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
    });
    if (!appt) throw new NotFoundException();
    if (
      user.role !== 'SUPER_ADMIN' &&
      (!user.hospitalId || appt.hospitalId !== user.hospitalId)
    ) {
      throw new NotFoundException();
    }
    const doctor =
      user.role === 'DOCTOR'
        ? await this.prisma.doctor.findUnique({
            where: { userId: user.id },
          })
        : null;
    if (user.role === 'DOCTOR' && doctor?.id !== appt.doctorId) {
      throw new NotFoundException();
    }
    const bmi =
      dto.heightCm && dto.weightKg
        ? Number((dto.weightKg / (dto.heightCm / 100) ** 2).toFixed(1))
        : undefined;
    return this.prisma.medicalRecord.upsert({
      where: { appointmentId: dto.appointmentId },
      create: {
        patientId: appt.patientId,
        doctorId: doctor?.id ?? appt.doctorId,
        ...dto,
        bmi,
      },
      update: { ...dto, bmi },
    });
  }

  async recordsForPatient(patientId: string, user: AuthUser) {
    if (
      user.role !== 'PATIENT' &&
      !['DOCTOR', 'NURSE', 'HOSPITAL_ADMIN', 'SUPER_ADMIN'].includes(user.role)
    ) {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'You do not have permission to view clinical records.',
      });
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, userId: true, hospitalId: true },
    });
    if (!patient) throw new NotFoundException();

    if (user.role === 'PATIENT') {
      if (patient.userId !== user.id) {
        throw new BadRequestException({
          error: 'FORBIDDEN',
          message: 'Cannot view another patient record',
        });
      }
    }
    if (
      user.role !== 'SUPER_ADMIN' &&
      (!user.hospitalId || patient.hospitalId !== user.hospitalId)
    ) {
      throw new NotFoundException();
    }
    return this.prisma.medicalRecord.findMany({
      where: { patientId },
      include: {
        doctor: { include: { user: true } },
        prescriptions: { include: { items: { include: { medicine: true } } } },
        labOrders: { include: { items: { include: { labTest: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async prescribe(
    user: AuthUser,
    dto: {
      medicalRecordId: string;
      notes?: string;
      items: {
        medicineId: string;
        dosage: string;
        frequency: string;
        durationDays: number;
        instructions?: string;
      }[];
    },
  ) {
    const record = await this.prisma.medicalRecord.findUnique({
      where: { id: dto.medicalRecordId },
      include: { appointment: true },
    });
    if (!record) throw new NotFoundException();
    if (
      user.role !== 'SUPER_ADMIN' &&
      (!user.hospitalId || record.appointment.hospitalId !== user.hospitalId)
    ) {
      throw new NotFoundException();
    }
    if (user.role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor || record.doctorId !== doctor.id)
        throw new NotFoundException();
    }

    return this.prisma.prescription.create({
      data: {
        medicalRecordId: dto.medicalRecordId,
        notes: dto.notes,
        items: { create: dto.items },
      },
      include: { items: { include: { medicine: true } } },
    });
  }

  async labOrder(
    user: AuthUser,
    dto: {
      medicalRecordId: string;
      testIds: string[];
      notes?: string;
    },
  ) {
    const record = await this.prisma.medicalRecord.findUnique({
      where: { id: dto.medicalRecordId },
      include: { appointment: true },
    });
    if (!record) throw new NotFoundException();
    if (
      user.role !== 'SUPER_ADMIN' &&
      (!user.hospitalId || record.appointment.hospitalId !== user.hospitalId)
    ) {
      throw new NotFoundException();
    }
    if (user.role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor || record.doctorId !== doctor.id)
        throw new NotFoundException();
    }
    return this.prisma.labOrder.create({
      data: {
        medicalRecordId: record.id,
        hospitalId: record.appointment.hospitalId,
        notes: dto.notes,
        items: { create: dto.testIds.map((labTestId) => ({ labTestId })) },
      },
      include: { items: { include: { labTest: true } } },
    });
  }

  labTests() {
    return this.prisma.labTest.findMany({ orderBy: { name: 'asc' } });
  }

  labOrders(user: AuthUser) {
    if (user.role === 'PATIENT') {
      return this.prisma.labOrder.findMany({
        where: { medicalRecord: { patient: { userId: user.id } } },
        include: {
          items: { include: { labTest: true } },
          medicalRecord: {
            include: {
              patient: { include: { user: true } },
              doctor: { include: { user: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    }

    if (user.role !== 'SUPER_ADMIN' && !user.hospitalId) {
      throw new ForbiddenException({
        error: 'HOSPITAL_SCOPE_REQUIRED',
        message: 'A hospital assignment is required to view lab orders.',
      });
    }

    return this.prisma.labOrder.findMany({
      where:
        user.role === 'SUPER_ADMIN' ? {} : { hospitalId: user.hospitalId! },
      include: {
        items: { include: { labTest: true } },
        medicalRecord: {
          include: {
            patient: { include: { user: true } },
            doctor: { include: { user: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async submitLabResult(
    user: AuthUser,
    id: string,
    dto: {
      status: LabOrderStatus;
      results?: { itemId: string; value: string }[];
    },
  ) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id },
      include: { medicalRecord: { include: { appointment: true } } },
    });
    if (!order) throw new NotFoundException();
    if (
      user.role !== 'SUPER_ADMIN' &&
      (!user.hospitalId || order.hospitalId !== user.hospitalId)
    ) {
      throw new NotFoundException();
    }

    if (dto.results) {
      for (const r of dto.results) {
        const item = await this.prisma.labOrderItem.findUnique({
          where: { id: r.itemId },
          include: { labTest: true },
        });
        if (!item || item.labOrderId !== id) throw new NotFoundException();
        const num = Number(r.value);
        let flagged = false;
        if (
          !Number.isNaN(num) &&
          item.labTest.refLow != null &&
          item.labTest.refHigh != null
        ) {
          flagged =
            num < Number(item.labTest.refLow) ||
            num > Number(item.labTest.refHigh);
        }
        await this.prisma.labOrderItem.update({
          where: { id: r.itemId },
          data: { value: r.value, flagged },
        });
      }
    }
    return this.prisma.labOrder.update({
      where: { id },
      data: { status: dto.status },
      include: { items: { include: { labTest: true } } },
    });
  }

  async dispense(user: AuthUser, prescriptionItemId: string) {
    const item = await this.prisma.prescriptionItem.findUnique({
      where: { id: prescriptionItemId },
      include: {
        medicine: { include: { batches: true } },
        prescription: {
          include: { medicalRecord: { include: { appointment: true } } },
        },
      },
    });
    if (!item) throw new NotFoundException();
    const hospitalId = item.prescription.medicalRecord.appointment.hospitalId;
    if (
      item.medicine.hospitalId !== hospitalId ||
      (user.role !== 'SUPER_ADMIN' &&
        (!user.hospitalId || hospitalId !== user.hospitalId))
    ) {
      throw new NotFoundException();
    }
    const now = new Date();
    const batch = item.medicine.batches
      .filter((b) => !b.quarantined && b.expiresAt > now && b.quantity > 0)
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())[0];
    if (!batch) {
      throw new BadRequestException({
        error: 'EXPIRED_OR_UNAVAILABLE',
        message: 'No valid (non-expired) stock available to dispense',
      });
    }
    await this.prisma.medicineBatch.update({
      where: { id: batch.id },
      data: { quantity: { decrement: 1 } },
    });
    return this.prisma.prescriptionItem.update({
      where: { id: prescriptionItemId },
      data: { dispensed: true },
    });
  }
}
