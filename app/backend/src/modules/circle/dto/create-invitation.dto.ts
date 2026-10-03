import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

import { CARE_VALUES, RELATION_CODES, RELATION_LABEL_MAX, type CareValue, type RelationCode } from '../circle.constants';
import { PermissionsDto } from './permissions.dto';

export class CreateInvitationDto {
  /** Sin correo, la invitación se comparte por código o enlace. */
  @IsOptional()
  @IsEmail({}, { message: 'Escribe un correo válido.' })
  @MaxLength(254)
  email?: string;

  /** Cómo se llama a esta persona (solo para reconocerla en la lista). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  inviteeName?: string;

  /** Lo que quien invita es para la persona invitada. */
  @IsIn(RELATION_CODES)
  relation!: RelationCode;

  @IsOptional()
  @IsString()
  @MaxLength(RELATION_LABEL_MAX)
  relationLabel?: string;

  /** Desde el punto de vista de quien invita. */
  @IsIn(CARE_VALUES)
  care!: CareValue;

  /** Lo que la persona invitada podrá hacer con la información de quien invita. */
  @ValidateNested()
  @Type(() => PermissionsDto)
  granted!: PermissionsDto;

  /** Lo que quien invita pide poder hacer con la información de la persona invitada. */
  @ValidateNested()
  @Type(() => PermissionsDto)
  requested!: PermissionsDto;

  /** Invitar en nombre de otra persona (requiere administrar su Círculo). */
  @IsOptional()
  @IsString()
  ownerId?: string;
}
