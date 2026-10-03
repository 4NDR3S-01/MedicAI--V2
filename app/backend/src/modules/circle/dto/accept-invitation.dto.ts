import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

import { RELATION_CODES, RELATION_LABEL_MAX, REMINDER_MODES, type RelationCode, type ReminderMode } from '../circle.constants';
import { PermissionsDto } from './permissions.dto';

export class AcceptInvitationDto {
  /** Respuesta a "¿Qué eres para esta persona?". */
  @IsIn(RELATION_CODES)
  relation!: RelationCode;

  @IsOptional()
  @IsString()
  @MaxLength(RELATION_LABEL_MAX)
  relationLabel?: string;

  /** Recibir sus recordatorios en mi teléfono: OFF | NOTIFY | ALARM. */
  @IsOptional()
  @IsIn(REMINDER_MODES)
  reminderMode?: ReminderMode;

  /** Grupos propios a los que añadir a esta persona (organización privada). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  groupIds?: string[];

  /** Lo que quien acepta concede a quien invitó (por defecto, lo que pidió). */
  @ValidateNested()
  @Type(() => PermissionsDto)
  granted!: PermissionsDto;
}
