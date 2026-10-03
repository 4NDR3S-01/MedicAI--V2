import { IsIn } from 'class-validator';

import { REMINDER_MODES, type ReminderMode } from '../circle.constants';

export class UpdateRemindersDto {
  @IsIn(REMINDER_MODES)
  mode!: ReminderMode;
}
