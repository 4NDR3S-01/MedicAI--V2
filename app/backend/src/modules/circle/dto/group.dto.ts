import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty({ message: 'Escribe un nombre para el grupo.' })
  @MaxLength(40)
  name!: string;

  /** Nombre de un icono de la app (p. ej. "home-heart"). */
  @IsOptional()
  @Matches(/^[a-z0-9-]{1,40}$/)
  icon?: string;
}

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Escribe un nombre para el grupo.' })
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @Matches(/^[a-z0-9-]{1,40}$/)
  icon?: string;
}

export class SetLinkGroupsDto {
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  groupIds!: string[];
}
