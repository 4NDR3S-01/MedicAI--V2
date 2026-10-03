import { IsString, Matches, MaxLength } from 'class-validator';

export class LookupCodeDto {
  @IsString()
  @MaxLength(16)
  @Matches(/^[A-Za-z0-9 -]+$/, { message: 'El código solo tiene letras y números.' })
  code!: string;
}
