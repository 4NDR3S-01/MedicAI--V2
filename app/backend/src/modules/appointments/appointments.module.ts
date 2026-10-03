import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CircleModule } from '../circle/circle.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [AuthModule, CircleModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
