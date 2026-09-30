import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppointmentStatus, Role } from '../generated/prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/auth-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AppointmentsService } from './appointments.service';

@ApiTags('appointments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller()
export class AppointmentsController {
  constructor(private appointments: AppointmentsService) {}

  @Get('appointments')
  list(
    @Req() req: { user: AuthUser },
    @Query('date') date?: string,
    @Query('status') status?: AppointmentStatus,
  ) {
    return this.appointments.list(req.user, { date, status });
  }

  @Get('doctors/:id/slots')
  slots(@Param('id') id: string, @Query('date') date: string) {
    return this.appointments.slots(id, date);
  }

  @Post('appointments')
  @Roles(Role.PATIENT, Role.RECEPTIONIST, Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  book(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      doctorId: string;
      patientId?: string;
      startsAt: string;
      reason?: string;
      emergency?: boolean;
    },
  ) {
    return this.appointments.book(req.user, body);
  }

  @Patch('appointments/:id/status')
  @Roles(
    Role.DOCTOR,
    Role.RECEPTIONIST,
    Role.HOSPITAL_ADMIN,
    Role.NURSE,
    Role.SUPER_ADMIN,
  )
  status(
    @Param('id') id: string,
    @Body() body: { status: AppointmentStatus },
    @Req() req: { user: AuthUser },
  ) {
    return this.appointments.updateStatus(id, body.status, req.user);
  }
}

