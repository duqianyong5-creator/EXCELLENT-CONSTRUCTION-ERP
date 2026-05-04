import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: '邮箱或用户名', example: 'admin@trucksystem.com' })
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @ApiProperty({ description: '密码', example: 'Admin@123456' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
