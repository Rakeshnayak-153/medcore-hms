import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { ClinicalService } from './clinical.service';

describe('ClinicalService', () => {
  it('scopes patient lab orders to the signed-in patient', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ClinicalService({
      labOrder: { findMany },
    } as unknown as PrismaService);

    await service.labOrders({
      id: 'patient-user-1',
      email: 'patient@example.test',
      fullName: 'Patient',
      role: 'PATIENT',
      hospitalId: 'hospital-1',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { medicalRecord: { patient: { userId: 'patient-user-1' } } },
      }),
    );
  });

  it('rejects reading records from another hospital', async () => {
    const findMany = jest.fn();
    const service = new ClinicalService({
      patient: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'patient-1',
          userId: 'patient-user-1',
          hospitalId: 'hospital-2',
        }),
      },
      medicalRecord: { findMany },
    } as unknown as PrismaService);

    await expect(
      service.recordsForPatient('patient-1', {
        id: 'doctor-user-1',
        email: 'doctor@example.test',
        fullName: 'Doctor',
        role: 'DOCTOR',
        hospitalId: 'hospital-1',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(findMany).not.toHaveBeenCalled();
  });

  it("rejects a doctor writing a different doctor's appointment record", async () => {
    const upsert = jest.fn();
    const service = new ClinicalService({
      appointment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'appointment-1',
          doctorId: 'doctor-2',
          hospitalId: 'hospital-1',
        }),
      },
      doctor: {
        findUnique: jest.fn().mockResolvedValue({ id: 'doctor-1' }),
      },
      medicalRecord: { upsert },
    } as unknown as PrismaService);

    await expect(
      service.createRecord(
        {
          id: 'doctor-user-1',
          email: 'doctor@example.test',
          fullName: 'Doctor',
          role: 'DOCTOR',
          hospitalId: 'hospital-1',
        },
        { appointmentId: 'appointment-1', diagnosis: 'Test' },
      ),
    ).rejects.toThrow(NotFoundException);

    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects prescriptions for records outside the doctor's hospital", async () => {
    const create = jest.fn();
    const service = new ClinicalService({
      medicalRecord: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'record-1',
          doctorId: 'doctor-2',
          appointment: { hospitalId: 'hospital-2' },
        }),
      },
      prescription: { create },
    } as unknown as PrismaService);

    await expect(
      service.prescribe(
        {
          id: 'doctor-user-1',
          email: 'doctor@example.test',
          fullName: 'Doctor',
          role: 'DOCTOR',
          hospitalId: 'hospital-1',
        },
        { medicalRecordId: 'record-1', items: [] },
      ),
    ).rejects.toThrow(NotFoundException);

    expect(create).not.toHaveBeenCalled();
  });

  it("rejects lab orders for records outside the doctor's hospital", async () => {
    const create = jest.fn();
    const service = new ClinicalService({
      medicalRecord: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'record-1',
          doctorId: 'doctor-2',
          appointment: { hospitalId: 'hospital-2' },
        }),
      },
      labOrder: { create },
    } as unknown as PrismaService);

    await expect(
      service.labOrder(
        {
          id: 'doctor-user-1',
          email: 'doctor@example.test',
          fullName: 'Doctor',
          role: 'DOCTOR',
          hospitalId: 'hospital-1',
        },
        { medicalRecordId: 'record-1', testIds: ['test-1'] },
      ),
    ).rejects.toThrow(NotFoundException);

    expect(create).not.toHaveBeenCalled();
  });

  it('rejects lab result items that belong to a different order', async () => {
    const updateItem = jest.fn();
    const updateOrder = jest.fn();
    const service = new ClinicalService({
      labOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          hospitalId: 'hospital-1',
          medicalRecord: { appointment: { hospitalId: 'hospital-1' } },
        }),
        update: updateOrder,
      },
      labOrderItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'item-1',
          labOrderId: 'order-2',
          labTest: { refLow: null, refHigh: null },
        }),
        update: updateItem,
      },
    } as unknown as PrismaService);

    await expect(
      service.submitLabResult(
        {
          id: 'lab-user-1',
          email: 'lab@example.test',
          fullName: 'Lab Tech',
          role: 'LAB_TECHNICIAN',
          hospitalId: 'hospital-1',
        },
        'order-1',
        { status: 'IN_PROGRESS', results: [{ itemId: 'item-1', value: '5' }] },
      ),
    ).rejects.toThrow(NotFoundException);

    expect(updateItem).not.toHaveBeenCalled();
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it('rejects dispensing prescription medicine from another hospital', async () => {
    const updateBatch = jest.fn();
    const updateItem = jest.fn();
    const service = new ClinicalService({
      prescriptionItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'item-1',
          medicine: {
            hospitalId: 'hospital-2',
            batches: [
              {
                id: 'batch-1',
                quarantined: false,
                expiresAt: new Date(Date.now() + 86400000),
                quantity: 2,
              },
            ],
          },
          prescription: {
            medicalRecord: { appointment: { hospitalId: 'hospital-2' } },
          },
        }),
        update: updateItem,
      },
      medicineBatch: { update: updateBatch },
    } as unknown as PrismaService);

    await expect(
      service.dispense(
        {
          id: 'pharmacist-1',
          email: 'pharmacist@example.test',
          fullName: 'Pharmacist',
          role: 'PHARMACIST',
          hospitalId: 'hospital-1',
        },
        'item-1',
      ),
    ).rejects.toThrow(NotFoundException);

    expect(updateBatch).not.toHaveBeenCalled();
    expect(updateItem).not.toHaveBeenCalled();
  });
});
