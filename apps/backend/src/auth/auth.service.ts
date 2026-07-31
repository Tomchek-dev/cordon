import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException('username already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    // The very first account on a fresh instance has no one to grant it admin
    // rights, so it bootstraps itself; everyone after that starts as a regular member.
    const isFirstUser = (await this.prisma.user.count()) === 0;
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        displayName: dto.displayName,
        passwordHash,
        role: isFirstUser ? 'ADMIN' : 'MEMBER',
      },
    });

    return this.buildToken(user.id, user.username);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) {
      throw new UnauthorizedException('invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('invalid credentials');
    }

    return this.buildToken(user.id, user.username);
  }

  private buildToken(sub: string, username: string) {
    const accessToken = this.jwtService.sign({ sub, username });
    return { accessToken };
  }
}
