import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

import { RELATION_CODES, RELATION_LABEL_MAX, type RelationCode } from '../circle.constants';
import { PermissionsDto } from './permissions.dto';

export class AcceptInvitationDto {
  /** Respuesta a "¿Qué eres para esta persona?". */
  @IsIn(RELATION_CODES)
  relation!: RelationCode;

  @IsOptional()
  @IsString()
  @MaxLength(RELATION_LABEL_MAX)
  relationLabel?: string;

  /** Lo que quien acepta concede a quien invitó (por defecto, lo que pidió). */
  @ValidateNested()
  @Type(() => PermissionsDto)
  granted!: PermissionsDto;
}
