import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { RELATION_CODES, RELATION_LABEL_MAX, type RelationCode } from '../circle.constants';

export class CreateDependentDto {
  @IsString()
  @IsNotEmpty({ message: 'Escribe su nombre.' })
  @MaxLength(80)
  fullName!: string;

  /** AAAA-MM-DD */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha de nacimiento no válida.' })
  birthDate?: string;

  /** Lo que la persona a cargo es para mí (p. ej. SON). */
  @IsIn(RELATION_CODES)
  relation!: RelationCode;

  @IsOptional()
  @IsString()
  @MaxLength(RELATION_LABEL_MAX)
  relationLabel?: string;

  /** Lo que yo soy para la persona a cargo (p. ej. MOTHER). */
  @IsIn(RELATION_CODES)
  myRelation!: RelationCode;

  @IsOptional()
  @IsString()
  @MaxLength(RELATION_LABEL_MAX)
  myRelationLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergies?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  conditions?: string;

  // Situaciones especiales (las mismas que en el registro).
  @IsOptional() @IsBoolean() pregnancy?: boolean;
  @IsOptional() @IsBoolean() lactation?: boolean;
  @IsOptional() @IsBoolean() recentSurgeries?: boolean;
  @IsOptional() @IsBoolean() immunosuppression?: boolean;
  @IsOptional() @IsBoolean() anticoagulantTreatment?: boolean;

  /** Grupos propios en los que colocar a la persona. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  groupIds?: string[];
}
