import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentMethod, Role } from '../generated/prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/auth-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { BillingService } from './billing.service';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller()
export class BillingController {
  constructor(private billing: BillingService) {}

  @Get('invoices')
  invoices(@Req() req: { user: AuthUser }) {
    return this.billing.list(req.user);
  }

  @Post('invoices')
  @Roles(
    Role.RECEPTIONIST,
    Role.ACCOUNTANT,
    Role.HOSPITAL_ADMIN,
    Role.SUPER_ADMIN,
  )
  create(
    @Req() req: { user: AuthUser },
    @Body() body: { appointmentId: string },
  ) {
    return this.billing.createInvoice(req.user, body.appointmentId);
  }

  @Post('payments')
  @Roles(
    Role.PATIENT,
    Role.RECEPTIONIST,
    Role.ACCOUNTANT,
    Role.HOSPITAL_ADMIN,
    Role.SUPER_ADMIN,
  )
  pay(
    @Req() req: { user: AuthUser },
    @Body() body: { invoiceId: string; method?: PaymentMethod },
  ) {
    return this.billing.pay(req.user, body.invoiceId, body.method);
  }

  @Get('analytics/revenue')
  @Roles(Role.HOSPITAL_ADMIN, Role.ACCOUNTANT, Role.SUPER_ADMIN, Role.DOCTOR)
  analytics(
    @Req() req: { user: AuthUser },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.billing.analytics(req.user, from, to);
  }

  @Get('notifications/me')
  notes(@Req() req: { user: AuthUser }) {
    return this.billing.notifications(req.user);
  }
}

