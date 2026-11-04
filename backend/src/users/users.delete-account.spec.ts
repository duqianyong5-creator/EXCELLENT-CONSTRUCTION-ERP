import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { UserRole, UserStatus } from './user.entity';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { ErrorCode } from '../common/i18n/messages';

/**
 * What happens to an account after its owner deletes it, run through the real UsersService, AuthService and
 * JwtStrategy over a small in-memory users table (unique username and email, like the database).
 */
function inMemoryUsers() {
  const rows: any[] = [];
  let next = 1;
  const matches = (row: any, where: any) => Object.keys(where).every((k) => row[k] === where[k]);
  const repo: any = {
    rows,
    create: (data: any) => ({ ...data }),
    findOne: jest.fn(async ({ where }: any) => {
      const wheres = Array.isArray(where) ? where : [where];
      const row = rows.find((r) => wheres.some((w: any) => matches(r, w)));
      if (!row) return null;
      const { password, ...rest } = row; // password is select: false
      return { ...rest };
    }),
    createQueryBuilder: jest.fn(() => {
      let id: string | undefined;
      const qb: any = {
        addSelect: () => qb,
        where: (_sql: string, params: any) => {
          id = params.id;
          return qb;
        },
        getOne: async () => {
          const row = rows.find((r) => r.id === id);
          return row ? { ...row } : null;
        },
      };
      return qb;
    }),
    save: jest.fn(async (u: any) => {
      const clash = rows.find(
        (r) => r.id !== u.id && (r.username === u.username || r.email === u.email),
      );
      if (clash) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      if (!u.id) u.id = `00000000-0000-0000-0000-00000000000${next++}`;
      const i = rows.findIndex((r) => r.id === u.id);
      if (i >= 0) rows[i] = { ...rows[i], ...u };
      else rows.push({ ...u });
      return { ...u };
    }),
    remove: jest.fn(),
  };
  // deleteOwnAccount saves the user and scrubs the audit log / notifications in one transaction
  repo.manager = {
    transaction: jest.fn(async (fn: any) =>
      fn({ save: (u: any) => repo.save(u), update: jest.fn(), delete: jest.fn() })),
  };
  return repo;
}

async function setup() {
  const repo = inMemoryUsers();
  const users = new UsersService(repo, {} as any, {} as any);
  const auth = new AuthService(users, { sign: jest.fn(() => 'token') } as any, { record: jest.fn() } as any);
  const jwt = new JwtStrategy({ get: () => 'test-secret' } as any, users);
  const liu = await users.create({
    username: 'liu',
    email: 'liu@example.com',
    fullName: 'Liu',
    phone: '021 123',
    role: UserRole.DRIVER,
    status: UserStatus.ACTIVE,
    password: await bcrypt.hash('secret1', 4),
  });
  return { repo, users, auth, jwt, liu };
}

describe('UsersService.deleteOwnAccount input checks', () => {
  it('refuses an empty password without touching the account', async () => {
    const { users, liu, repo } = await setup();
    repo.save.mockClear();
    await expect(users.deleteOwnAccount(liu.id, '')).rejects.toThrow(ErrorCode.AUTH_WRONG_PASSWORD);
    await expect(users.deleteOwnAccount(liu.id, undefined as any)).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('answers not found for an account that does not exist', async () => {
    const { users } = await setup();
    await expect(users.deleteOwnAccount('no-such-id', 'secret1')).rejects.toThrow(NotFoundException);
  });

  it('refuses the second delete of an already deleted account (old password no longer works)', async () => {
    const { users, liu } = await setup();
    await users.deleteOwnAccount(liu.id, 'secret1');
    await expect(users.deleteOwnAccount(liu.id, 'secret1')).rejects.toThrow(BadRequestException);
  });
});

describe('after an account is deleted', () => {
  it('frees the username and email so a new sign-up with the same ones goes through', async () => {
    const { users, auth, liu } = await setup();
    await users.deleteOwnAccount(liu.id, 'secret1');

    const result = await auth.register({
      username: 'liu',
      email: 'liu@example.com',
      fullName: 'Liu Again',
      role: UserRole.DRIVER,
      password: 'newpass1',
    } as any);

    expect(result.userId).toBeDefined();
    expect(result.userId).not.toBe(liu.id);
  });

  it('keeps one row for the old account, linked to its id, with nothing personal left in it', async () => {
    const { users, repo, liu } = await setup();
    await users.deleteOwnAccount(liu.id, 'secret1');

    expect(repo.rows).toHaveLength(1);
    const row = repo.rows[0];
    expect(row.id).toBe(liu.id);
    expect(JSON.stringify(row)).not.toMatch(/liu@example\.com|"Liu"|021 123/);
    expect(row.username).not.toBe('liu');
  });

  it('login with the old username says the account does not exist', async () => {
    const { users, auth, liu } = await setup();
    await users.deleteOwnAccount(liu.id, 'secret1');
    await expect(auth.validateUser('liu', 'secret1')).rejects.toThrow(ErrorCode.AUTH_ACCOUNT_NOT_FOUND);
    await expect(auth.validateUser('liu@example.com', 'secret1')).rejects.toThrow(UnauthorizedException);
  });

  it('login with the anonymised username is refused as disabled', async () => {
    const { users, auth, repo, liu } = await setup();
    await users.deleteOwnAccount(liu.id, 'secret1');
    const tag = repo.rows[0].username;
    await expect(auth.validateUser(tag, 'secret1')).rejects.toThrow(ErrorCode.AUTH_DISABLED);
  });

  it('a token issued before the delete no longer authenticates', async () => {
    const { users, jwt, liu } = await setup();
    await expect(jwt.validate({ sub: liu.id })).resolves.toMatchObject({ id: liu.id });

    await users.deleteOwnAccount(liu.id, 'secret1');

    await expect(jwt.validate({ sub: liu.id })).rejects.toThrow(UnauthorizedException);
  });
});

describe('JwtStrategy.validate', () => {
  it('rejects every non-active status', async () => {
    for (const status of [UserStatus.DISABLED, UserStatus.PENDING, UserStatus.REJECTED]) {
      const users: any = { findById: jest.fn(async () => ({ id: 'u1', status })) };
      const jwt = new JwtStrategy({ get: () => 'test-secret' } as any, users);
      await expect(jwt.validate({ sub: 'u1' })).rejects.toThrow(UnauthorizedException);
    }
  });
});
