import { IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'username may only contain letters, numbers, and underscores' })
  username: string;

  @IsString()
  @Length(1, 64)
  displayName: string;

  @IsString()
  @Length(8, 128)
  password: string;
}
