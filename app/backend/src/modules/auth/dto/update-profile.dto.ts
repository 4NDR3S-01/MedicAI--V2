import { IsInt, IsOptional, Min, Max } from 'class-validator';

export class UpdateProfileDto {
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(120)
  notificationLeadMinutes?: number;
}
