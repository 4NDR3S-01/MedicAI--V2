import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateDependentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Escribe su nombre.' })
  @MaxLength(80)
  fullName?: string;

  /** AAAA-MM-DD, o vacío para borrarla. */
  @IsOptional()
  @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: 'Fecha de nacimiento no válida.' })
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergies?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  conditions?: string;
}
