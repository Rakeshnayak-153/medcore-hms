import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  it('rejects invoice creation for an appointment at another hospital', async () => {
    const upsertInvoice = jest.fn();
    const service = new BillingService({
      appointment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'appointment-1',
          hospitalId: 'hospital-2',
          patientId: 'patient-2',
        }),
      },
      invoice: { upsert: upsertInvoice },
    } as unknown as PrismaService);

    await expect(
      service.createInvoice(
        {
          id: 'staff-1',
          email: 'staff@example.test',
          fullName: 'Staff',
          role: 'ACCOUNTANT',
          hospitalId: 'hospital-1',
        },
        'appointment-1',
      ),
    ).rejects.toThrow(NotFoundException);

    expect(upsertInvoice).not.toHaveBeenCalled();
  });

  it('rejects invoice listing for staff without hospital scope', async () => {
    const findMany = jest.fn();
    const service = new BillingService({
      invoice: { findMany },
    } as unknown as PrismaService);

    expect(() =>
      service.list({
        id: 'staff-1',
        email: 'staff@example.test',
        fullName: 'Staff',
        role: 'ACCOUNTANT',
        hospitalId: null,
      }),
    ).toThrow(ForbiddenException);

    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects analytics for staff without hospital scope', async () => {
    const findMany = jest.fn();
    const count = jest.fn();
    const service = new BillingService({
      patient: { count },
      appointment: { findMany },
      invoice: { findMany },
      room: { findMany },
    } as unknown as PrismaService);

    await expect(
      service.analytics({
        id: 'staff-1',
        email: 'staff@example.test',
        fullName: 'Staff',
        role: 'DOCTOR',
        hospitalId: null,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(count).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('does not allow a patient to pay another patient invoice', async () => {
    const createPayment = jest.fn();
    const updateInvoice = jest.fn();
    const service = new BillingService({
      invoice: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'invoice-1',
          patientId: 'patient-2',
          hospitalId: 'hospital-1',
          status: 'ISSUED',
          total: 500,
        }),
        update: updateInvoice,
      },
      patient: {
        findUnique: jest.fn().mockResolvedValue({ id: 'patient-1' }),
      },
      payment: { create: createPayment },
    } as unknown as PrismaService);

    await expect(
      service.pay(
        {
          id: 'patient-user-1',
          email: 'patient@example.test',
          fullName: 'Patient',
          role: 'PATIENT',
          hospitalId: 'hospital-1',
        },
        'invoice-1',
      ),
    ).rejects.toThrow(NotFoundException);

    expect(createPayment).not.toHaveBeenCalled();
    expect(updateInvoice).not.toHaveBeenCalled();
  });
});
