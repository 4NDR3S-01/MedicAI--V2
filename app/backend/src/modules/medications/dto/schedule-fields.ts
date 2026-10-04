import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const SCHEDULE_TYPES = ['DAILY', 'WEEKDAYS', 'INTERVAL', 'AS_NEEDED'] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

/** Un tramo de una dosis que cambia con el tiempo: "40 mg durante 5 días". */
export class DosageStepDto {
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  dosage!: string;
}

/**
 * Campos de horario flexible y existencias, comunes a crear y editar.
 * `null` borra el valor al editar.
 */
export class ScheduleFieldsDto {
  @IsOptional()
  @IsIn(SCHEDULE_TYPES)
  scheduleType?: ScheduleType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekDays?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  dayInterval?: number | null;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DosageStepDto)
  dosageSteps?: DosageStepDto[] | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  maxDailyDoses?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(72)
  minHoursBetween?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  stockQuantity?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000)
  stockPerDose?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  stockAlertAt?: number | null;
}
