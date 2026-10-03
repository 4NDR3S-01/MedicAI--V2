import { IsISO8601 } from 'class-validator';

export class CareDataQueryDto {
  /** Inicio del día local de quien consulta: desde ahí se devuelven las tomas. */
  @IsISO8601()
  since!: string;
}
