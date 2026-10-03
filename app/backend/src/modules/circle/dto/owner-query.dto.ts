import { IsOptional, IsString } from 'class-validator';

/** Actuar sobre el Círculo de otra persona (requiere administrarlo). */
export class OwnerQueryDto {
  @IsOptional()
  @IsString()
  ownerId?: string;
}
