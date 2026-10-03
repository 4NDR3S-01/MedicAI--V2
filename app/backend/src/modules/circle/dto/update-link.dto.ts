import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { CARE_VALUES, RELATION_CODES, RELATION_LABEL_MAX, type CareValue, type RelationCode } from '../circle.constants';

export class UpdateLinkDto {
  /** Lo que yo soy para la otra persona. */
  @IsOptional()
  @IsIn(RELATION_CODES)
  relation?: RelationCode;

  @IsOptional()
  @IsString()
  @MaxLength(RELATION_LABEL_MAX)
  relationLabel?: string;

  /** Desde mi punto de vista. */
  @IsOptional()
  @IsIn(CARE_VALUES)
  care?: CareValue;
}
