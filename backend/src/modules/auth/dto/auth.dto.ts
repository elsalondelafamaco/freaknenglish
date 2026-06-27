import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator'

export class SignupDto {
  @IsEmail() email!: string
  @IsString() @MinLength(8) password!: string
  @IsString() fullName!: string
  @IsString() @IsOptional() phone?: string
}

export class LoginDto {
  @IsEmail() email!: string
  @IsString() password!: string
}

export class ForgotPasswordDto {
  @IsEmail() email!: string
}

export class ResetPasswordDto {
  @IsString() token!: string
  @IsString() @MinLength(8) password!: string
}
