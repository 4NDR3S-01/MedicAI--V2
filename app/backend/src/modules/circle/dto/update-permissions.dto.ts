import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';

import { PermissionsDto } from './permissions.dto';

export class UpdatePermissionsDto {
  /** Lo que la otra persona del vínculo puede hacer con mi información. */
  @ValidateNested()
  @Type(() => PermissionsDto)
  permissions!: PermissionsDto;

  /** Cambiar los permisos de otra persona (requiere administrar su Círculo). */
  @IsOptional()
  @IsString()
  ownerId?: string;
}
