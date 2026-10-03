import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CircleModule } from '../circle/circle.module';
import { MedicationsController } from './medications.controller';
import { MedicationsService } from './medications.service';

@Module({
  imports: [AuthModule, CircleModule],
  controllers: [MedicationsController],
  providers: [MedicationsService],
})
export class MedicationsModule {}
