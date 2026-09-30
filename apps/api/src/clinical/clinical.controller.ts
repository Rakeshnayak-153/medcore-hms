import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LabOrderStatus, Role } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/auth-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ClinicalService } from './clinical.service';

@ApiTags('clinical')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller()
export class ClinicalController {
  constructor(private clinical: ClinicalService) {}

  @Post('medical-records')
  @Roles(Role.DOCTOR, Role.NURSE, Role.SUPER_ADMIN)
  createRecord(
    @Req() req: { user: AuthUser },
    @Body() body: Parameters<ClinicalService['createRecord']>[1],
  ) {
    return this.clinical.createRecord(req.user, body);
  }

  @Get('medical-records/:patientId')
  records(
    @Param('patientId') patientId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.clinical.recordsForPatient(patientId, req.user);
  }

  @Post('prescriptions')
  @Roles(Role.DOCTOR, Role.SUPER_ADMIN)
  prescribe(
    @Req() req: { user: AuthUser },
    @Body() body: Parameters<ClinicalService['prescribe']>[1],
  ) {
    return this.clinical.prescribe(req.user, body);
  }

  @Get('lab-tests')
  tests() {
    return this.clinical.labTests();
  }

  @Get('lab-orders')
  orders(@Req() req: { user: AuthUser }) {
    return this.clinical.labOrders(req.user);
  }

  @Post('lab-orders')
  @Roles(Role.DOCTOR, Role.SUPER_ADMIN)
  labOrder(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      medicalRecordId: string;
      testIds: string[];
      notes?: string;
    },
  ) {
    return this.clinical.labOrder(req.user, body);
  }

  @Patch('lab-orders/:id/result')
  @Roles(Role.LAB_TECHNICIAN, Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  result(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body()
    body: {
      status: LabOrderStatus;
      results?: { itemId: string; value: string }[];
    },
  ) {
    return this.clinical.submitLabResult(req.user, id, body);
  }

  @Post('pharmacy/dispense/:itemId')
  @Roles(Role.PHARMACIST, Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  dispense(@Req() req: { user: AuthUser }, @Param('itemId') itemId: string) {
    return this.clinical.dispense(req.user, itemId);
  }
}
