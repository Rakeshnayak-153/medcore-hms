import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';

const rootEnvPath = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnvPath)) process.loadEnvFile(rootEnvPath);

if (process.env.NODE_ENV === 'production') {
  throw new Error('Demo seed is disabled in production.');
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function createDemoUser({ email, fullName, role, hospitalId }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== role) {
    throw new Error(`${email} already exists with a different role.`);
  }

  if (existing) {
    return { user: existing, password: null };
  }

  const password = randomBytes(18).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      fullName,
      role,
      hospitalId,
      passwordHash,
      emailVerified: true,
      isActive: true,
    },
  });
  return { user, password };
}

async function main() {
  let hospital = await prisma.hospital.findUnique({
    where: { code: 'MEDCORE-DEMO' },
  });

  if (!hospital) {
    hospital = await prisma.hospital.create({
      data: {
        name: 'MedCore Demo Hospital',
        code: 'MEDCORE-DEMO',
        phone: '+910000000000',
        email: 'hospital.demo@medcore.local',
        verified: true,
        address: {
          create: {
            line1: '1 Demo Road',
            city: 'Demo City',
            state: 'Demo State',
            postalCode: '000000',
            country: 'IN',
          },
        },
      },
    });
  }

  const department = await prisma.department.upsert({
    where: {
      hospitalId_code: { hospitalId: hospital.id, code: 'GENERAL' },
    },
    update: {},
    create: {
      hospitalId: hospital.id,
      name: 'General Medicine',
      code: 'GENERAL',
    },
  });

  const { user: doctorUser, password: doctorPassword } = await createDemoUser({
    email: 'doctor.demo@medcore.local',
    fullName: 'Dr. Demo Clinician',
    role: 'DOCTOR',
    hospitalId: hospital.id,
  });

  const doctor = await prisma.doctor.upsert({
    where: { userId: doctorUser.id },
    update: {
      departmentId: department.id,
      specialisation: 'General Medicine',
    },
    create: {
      userId: doctorUser.id,
      departmentId: department.id,
      specialisation: 'General Medicine',
      licenseNo: 'MEDCORE-DEMO-DOCTOR',
      consultationFee: 500,
    },
  });

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const availability = await prisma.doctorAvailability.findFirst({
      where: { doctorId: doctor.id, weekday },
    });
    if (!availability) {
      await prisma.doctorAvailability.create({
        data: {
          doctorId: doctor.id,
          weekday,
          startTime: '09:00',
          endTime: '17:00',
          slotMins: 30,
        },
      });
    }
  }

  const patientEmail = (
    process.env.DEMO_PATIENT_EMAIL ?? 'patient.demo@medcore.local'
  ).toLowerCase();
  const { user: patientUser, password: patientPassword } = await createDemoUser(
    {
      email: patientEmail,
      fullName: 'Demo Patient',
      role: 'PATIENT',
      hospitalId: hospital.id,
    },
  );

  await prisma.user.update({
    where: { id: patientUser.id },
    data: { hospitalId: hospital.id },
  });

  const patient = await prisma.patient.findUnique({
    where: { userId: patientUser.id },
  });
  if (patient) {
    await prisma.patient.update({
      where: { id: patient.id },
      data: { hospitalId: hospital.id },
    });
  } else {
    await prisma.patient.create({
      data: {
        userId: patientUser.id,
        hospitalId: hospital.id,
        mrn: `DEMO-${randomBytes(6).toString('hex').toUpperCase()}`,
        dateOfBirth: new Date('1990-01-01'),
        gender: 'unspecified',
      },
    });
  }

  console.log(`Demo hospital: ${hospital.name}`);
  console.log(`Doctor: ${doctorUser.email}`);
  if (doctorPassword) console.log(`New doctor password: ${doctorPassword}`);
  console.log(`Patient: ${patientUser.email}`);
  if (patientPassword) console.log(`New patient password: ${patientPassword}`);
  console.log('Doctor has appointment availability every day, 09:00-17:00.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
