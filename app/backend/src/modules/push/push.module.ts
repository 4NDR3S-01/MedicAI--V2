import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CareNotifierService } from './care-notifier.service';
import { MissedDoseService } from './missed-dose.service';
import { PushController } from './push.controller';
import { PushService } from './push.service';

/** Global: Círculo, Medicamentos y Citas avisan sin importar el módulo. */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [PushController],
  providers: [PushService, CareNotifierService, MissedDoseService],
  exports: [PushService, CareNotifierService],
})
export class PushModule {}
