import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

import { OwnerQueryDto } from '../../circle/dto/owner-query.dto';

export const REPEAT_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type RepeatFrequency = (typeof REPEAT_FREQUENCIES)[number];

/** Máximo de citas de una serie (unos 8 meses de diálisis 3 veces por semana). */
export const MAX_SERIES_OCCURRENCES = 104;

/**
 * Repetir una cita: cada `interval` días, semanas (en `weekDays`) o meses,
 * hasta `until` (incluido) o `count` veces.
 */
export class RepeatDto {
  @IsIn(REPEAT_FREQUENCIES)
  frequency!: RepeatFrequency;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  interval?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekDays?: number[];

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  until?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(MAX_SERIES_OCCURRENCES)
  count?: number;
}

export const SERIES_SCOPES = ['ONE', 'FOLLOWING'] as const;
export type SeriesScope = (typeof SERIES_SCOPES)[number];

/** Al editar o eliminar una cita de una serie: solo esa o esa y las siguientes. */
export class SeriesScopeQueryDto extends OwnerQueryDto {
  @IsOptional()
  @IsIn(SERIES_SCOPES)
  scope?: SeriesScope;
}
