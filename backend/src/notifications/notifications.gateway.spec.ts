import { NotificationsGateway } from './notifications.gateway';
import { UserRole, UserStatus } from '../users/user.entity';

// A JWT stays valid for days after the account behind it is deleted or disabled. The socket gateway used to
// trust the token alone, so a removed dispatcher kept receiving the fleet's live positions.
describe('NotificationsGateway.handleConnection', () => {
  function setup(account: any) {
    const jwt = { verify: jest.fn(() => ({ sub: 'u1', role: UserRole.DISPATCHER })) };
    const config = { get: jest.fn(() => 'secret') };
    const users = { findById: jest.fn(async () => { if (!account) throw new Error('not found'); return account; }) };
    const gateway = new NotificationsGateway(jwt as any, config as any, users as any);
    const client: any = {
      id: 's1', data: {}, handshake: { auth: { token: 't' } },
      join: jest.fn(), disconnect: jest.fn(),
    };
    return { gateway, client };
  }

  it('refuses a token whose account is no longer active', async () => {
    const { gateway, client } = setup({ id: 'u1', role: UserRole.DISPATCHER, status: UserStatus.DISABLED });
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('refuses a token whose account no longer exists', async () => {
    const { gateway, client } = setup(null);
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('joins the room of the role in the database, not the one in an old token', async () => {
    const { gateway, client } = setup({ id: 'u1', role: UserRole.DRIVER, status: UserStatus.ACTIVE });
    (gateway as any).server = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    await gateway.handleConnection(client);
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.join).toHaveBeenCalledWith('role:driver');
    expect(client.join).not.toHaveBeenCalledWith('role:dispatcher');
  });
});
