import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from './catalog.service';

describe('CatalogService tenant boundaries', () => {
  it('rejects a doctor catalog request for another hospital', async () => {
    const findMany = jest.fn();
    const service = new CatalogService({
      doctor: { findMany },
    } as unknown as PrismaService);

    expect(() =>
      service.doctors(
        {
          id: 'staff-1',
          email: 'staff@example.test',
          fullName: 'Staff',
          role: 'RECEPTIONIST',
          hospitalId: 'hospital-1',
        },
        'hospital-2',
      ),
    ).toThrow(NotFoundException);

    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects patient listing for staff without hospital scope', async () => {
    const findMany = jest.fn();
    const service = new CatalogService({
      patient: { findMany },
    } as unknown as PrismaService);

    await expect(
      service.patients({
        id: 'staff-1',
        email: 'staff@example.test',
        fullName: 'Staff',
        role: 'RECEPTIONIST',
        hospitalId: null,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects patient profile access when staff has no hospital scope', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'patient-1',
      userId: 'patient-user-1',
      hospitalId: 'hospital-1',
    });
    const service = new CatalogService({
      patient: { findUnique },
    } as unknown as PrismaService);

    await expect(
      service.patientById('patient-1', {
        id: 'staff-1',
        email: 'staff@example.test',
        fullName: 'Staff',
        role: 'RECEPTIONIST',
        hospitalId: null,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects detailed patient records for an accountant in the same hospital', async () => {
    const findUnique = jest.fn();
    const service = new CatalogService({
      patient: { findUnique },
    } as unknown as PrismaService);

    await expect(
      service.patientById('patient-1', {
        id: 'accountant-1',
        email: 'accountant@example.test',
        fullName: 'Accountant',
        role: 'ACCOUNTANT',
        hospitalId: 'hospital-1',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(findUnique).not.toHaveBeenCalled();
  });

  it('scopes patient search results to the signed-in user', async () => {
    const patientFindMany = jest.fn().mockResolvedValue([]);
    const service = new CatalogService({
      patient: { findMany: patientFindMany },
      doctor: { findMany: jest.fn().mockResolvedValue([]) },
      medicine: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService);

    await service.search(
      {
        id: 'patient-user-1',
        email: 'patient@example.test',
        fullName: 'Patient',
        role: 'PATIENT',
        hospitalId: 'hospital-1',
      },
      'patient',
    );

    expect(patientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'patient-user-1' }),
      }),
    );
  });
});

