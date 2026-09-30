import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/auth-user';
import { RolesGuard } from '../common/roles.guard';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller()
export class CatalogController {
  constructor(private catalog: CatalogService) {}

  @Get('hospitals')
  hospitals() {
    return this.catalog.hospitals();
  }

  @Get('hospitals/:id/departments')
  departments(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.catalog.departments(id, req.user);
  }

  @Get('doctors')
  doctors(
    @Req() req: { user: AuthUser },
    @Query('hospitalId') hospitalId?: string,
    @Query('specialisation') specialisation?: string,
  ) {
    return this.catalog.doctors(req.user, hospitalId, specialisation);
  }

  @Get('patients')
  patients(@Req() req: { user: AuthUser }, @Query('search') search?: string) {
    return this.catalog.patients(req.user, search);
  }

  @Get('patients/:id')
  patient(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.catalog.patientById(id, req.user);
  }

  @Get('medicines')
  medicines(@Req() req: { user: AuthUser }, @Query('search') search?: string) {
    return this.catalog.medicines(req.user, search);
  }

  @Get('search')
  search(@Req() req: { user: AuthUser }, @Query('q') q: string) {
    return this.catalog.search(req.user, q ?? '');
  }
}
