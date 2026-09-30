import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService', () => {
  it('rejects appointment listing without hospital scope', async () => {
    const findMany = jest.fn();
    const service = new AppointmentsService({
      appointment: { findMany },
    } as unknown as PrismaService);

    await expect(
      service.list(
        {
          id: 'staff-1',
          email: 'staff@example.test',
          fullName: 'Staff',
          role: 'RECEPTIONIST',
          hospitalId: null,
        },
        {},
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(findMany).not.toHaveBeenCalled();
  });

  describe('book', () => {
    it('rejects patient emergency requests before checking doctor availability', async () => {
      const findDoctor = jest.fn();
      const service = new AppointmentsService({
        doctor: { findUnique: findDoctor },
      } as unknown as PrismaService);

      await expect(
        service.book(
          {
            id: 'patient-1',
            email: 'patient@example.test',
            fullName: 'Test Patient',
            role: 'PATIENT',
            hospitalId: 'hospital-1',
          },
          {
            doctorId: 'doctor-1',
            startsAt: new Date(Date.now() + 60_000).toISOString(),
            emergency: true,
          },
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(findDoctor).not.toHaveBeenCalled();
    });

    it('rejects booking with a doctor from another hospital', async () => {
      const findPatient = jest.fn();
      const service = new AppointmentsService({
        doctor: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'doctor-1',
            department: { hospitalId: 'hospital-2' },
          }),
        },
        patient: { findUnique: findPatient },
      } as unknown as PrismaService);

      await expect(
        service.book(
          {
            id: 'staff-1',
            email: 'staff@example.test',
            fullName: 'Hospital Staff',
            role: 'RECEPTIONIST',
            hospitalId: 'hospital-1',
          },
          {
            doctorId: 'doctor-1',
            patientId: 'patient-1',
            startsAt: new Date(Date.now() + 60_000).toISOString(),
          },
        ),
      ).rejects.toThrow(NotFoundException);

      expect(findPatient).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('rejects non-super-admin users without a hospital scope', async () => {
      const update = jest.fn();
      const service = new AppointmentsService({
        appointment: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'appointment-1',
            hospitalId: 'hospital-1',
          }),
          update,
        },
      } as unknown as PrismaService);

      await expect(
        service.updateStatus('appointment-1', 'CONFIRMED', {
          id: 'staff-1',
          email: 'staff@example.test',
          fullName: 'Hospital Staff',
          role: 'RECEPTIONIST',
          hospitalId: null,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(update).not.toHaveBeenCalled();
    });

    it("rejects a doctor updating another doctor's appointment", async () => {
      const update = jest.fn();
      const service = new AppointmentsService({
        appointment: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'appointment-1',
            hospitalId: 'hospital-1',
            doctorId: 'doctor-2',
          }),
          update,
        },
        doctor: {
          findUnique: jest.fn().mockResolvedValue({ id: 'doctor-1' }),
        },
      } as unknown as PrismaService);

      await expect(
        service.updateStatus('appointment-1', 'CONFIRMED', {
          id: 'doctor-user-1',
          email: 'doctor@example.test',
          fullName: 'Doctor',
          role: 'DOCTOR',
          hospitalId: 'hospital-1',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(update).not.toHaveBeenCalled();
    });
  });
});

