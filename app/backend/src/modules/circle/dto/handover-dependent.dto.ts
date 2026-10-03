import { IsEmail, MaxLength } from 'class-validator';

export class HandoverDependentDto {
  @IsEmail({}, { message: 'Escribe un correo válido.' })
  @MaxLength(254)
  email!: string;
}
