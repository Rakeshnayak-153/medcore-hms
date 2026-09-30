import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  async createInvoice(user: AuthUser, appointmentId: string) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        doctor: true,
        medicalRecord: {
          include: {
            labOrders: { include: { items: { include: { labTest: true } } } },
          },
        },
      },
    });
    if (!appt) throw new NotFoundException();
    if (
      user.role !== 'SUPER_ADMIN' &&
      (!user.hospitalId || appt.hospitalId !== user.hospitalId)
    ) {
      throw new NotFoundException();
    }
    const items: {
      description: string;
      category: string;
      amount: Prisma.Decimal | number;
    }[] = [
      {
        description: `Consultation — ${appt.doctor.specialisation}`,
        category: 'consult',
        amount: appt.doctor.consultationFee,
      },
    ];
    for (const order of appt.medicalRecord?.labOrders ?? []) {
      for (const item of order.items) {
        items.push({
          description: item.labTest.name,
          category: 'lab',
          amount: item.labTest.price,
        });
      }
    }
    const subtotal = items.reduce((sum, i) => sum + Number(i.amount), 0);
    const tax = Number((subtotal * 0.05).toFixed(2));
    const total = Number((subtotal + tax).toFixed(2));
    return this.prisma.invoice.upsert({
      where: { appointmentId },
      create: {
        appointmentId,
        patientId: appt.patientId,
        hospitalId: appt.hospitalId,
        status: InvoiceStatus.ISSUED,
        subtotal,
        tax,
        total,
        items: {
          create: items.map((i) => ({
            description: i.description,
            category: i.category,
            amount: i.amount,
          })),
        },
      },
      update: {},
      include: {
        items: true,
        payments: true,
        patient: { include: { user: true } },
      },
    });
  }

  list(user: AuthUser) {
    if (
      user.role !== 'PATIENT' &&
      user.role !== 'SUPER_ADMIN' &&
      !user.hospitalId
    ) {
      throw new ForbiddenException({
        error: 'HOSPITAL_SCOPE_REQUIRED',
        message: 'A hospital assignment is required to view invoices.',
      });
    }
    const where =
      user.role === 'PATIENT'
        ? { patient: { userId: user.id } }
        : user.role === 'SUPER_ADMIN'
          ? {}
          : { hospitalId: user.hospitalId! };
    return this.prisma.invoice.findMany({
      where,
      include: {
        items: true,
        payments: true,
        patient: { include: { user: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async pay(
    user: AuthUser,
    invoiceId: string,
    method: PaymentMethod = PaymentMethod.CASH,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException();

    if (user.role === 'PATIENT') {
      const patient = await this.prisma.patient.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!patient || invoice.patientId !== patient.id) {
        throw new NotFoundException();
      }
    } else if (
      user.role !== 'SUPER_ADMIN' &&
      (!user.hospitalId || invoice.hospitalId !== user.hospitalId)
    ) {
      throw new NotFoundException();
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictException('Invoice has already been paid');
    }

    await this.prisma.payment.create({
      data: {
        invoiceId,
        amount: invoice.total,
        method,
        status: PaymentStatus.COMPLETED,
        reference: `DEV-${Date.now()}`,
      },
    });
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.PAID },
      include: { items: true, payments: true },
    });
  }

  async analytics(user: AuthUser, from?: string, to?: string) {
    if (user.role !== 'SUPER_ADMIN' && !user.hospitalId) {
      throw new ForbiddenException({
        error: 'HOSPITAL_SCOPE_REQUIRED',
        message: 'A hospital assignment is required to view analytics.',
      });
    }
    const hospitalId =
      user.role === 'SUPER_ADMIN' ? undefined : user.hospitalId!;
    const fromDate = from
      ? new Date(from)
      : new Date(Date.now() - 7 * 86400000);
    const toDate = to ? new Date(to) : new Date();
    const [patients, appointments, invoices, occupancy] = await Promise.all([
      this.prisma.patient.count({ where: hospitalId ? { hospitalId } : {} }),
      this.prisma.appointment.findMany({
        where: {
          ...(hospitalId ? { hospitalId } : {}),
          startsAt: { gte: fromDate, lte: toDate },
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          ...(hospitalId ? { hospitalId } : {}),
          createdAt: { gte: fromDate, lte: toDate },
        },
      }),
      this.prisma.room.findMany({ where: hospitalId ? { hospitalId } : {} }),
    ]);
    const revenue = invoices
      .filter((i) => i.status === 'PAID')
      .reduce((s, i) => s + Number(i.total), 0);
    const byDay = new Map<string, number>();
    for (const a of appointments) {
      const key = a.startsAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    const beds = occupancy.reduce((s, r) => s + r.capacity, 0);
    const occupied = occupancy.reduce((s, r) => s + r.occupied, 0);
    return {
      totalPatients: patients,
      appointmentsToday: appointments.filter(
        (a) =>
          a.startsAt.toISOString().slice(0, 10) ===
          new Date().toISOString().slice(0, 10),
      ).length,
      revenue,
      occupiedBeds: occupied,
      totalBeds: beds,
      appointmentVolume: [...byDay.entries()].map(([date, count]) => ({
        date,
        count,
      })),
    };
  }

  notifications(user: AuthUser) {
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
  }
}
