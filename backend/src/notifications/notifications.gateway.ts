import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket,
} from '@nestjs/websockets';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createCorsOriginResolver, requireConfig } from '../config/security.config';
import { UserRole, UserStatus } from '../users/user.entity';
import { UsersService } from '../users/users.service';

type ConnectedUser = {
  role: string;
  socketIds: Set<string>;
};

@WebSocketGateway({
  cors: {
    origin: createCorsOriginResolver(new ConfigService()),
    credentials: true,
  },
  namespace: '/',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('WsGateway');

  private connectedUsers = new Map<string, ConnectedUser>();

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    // the module pulls UsersModule in with forwardRef, so the provider is resolved the same way
    @Inject(forwardRef(() => UsersService)) private users: UsersService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        this.logger.warn(`socket ${client.id} rejected: no token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: requireConfig(this.config, 'JWT_SECRET'),
      });
      // A signed token outlives the account behind it (deleted, disabled, role changed): go by the database,
      // as the REST guard does, or a removed dispatcher keeps receiving the fleet's live positions
      const account = await this.users.findById(payload.sub).catch(() => null);
      if (!account || account.status !== UserStatus.ACTIVE) {
        this.logger.warn(`socket ${client.id} rejected: account ${payload.sub} is not active`);
        client.disconnect();
        return;
      }
      payload.role = account.role;
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      const existing = this.connectedUsers.get(payload.sub);
      if (existing) {
        existing.socketIds.add(client.id);
        existing.role = payload.role;
      } else {
        this.connectedUsers.set(payload.sub, {
          role: payload.role,
          socketIds: new Set([client.id]),
        });
      }
      client.join(`user:${payload.sub}`);
      client.join(`role:${payload.role}`);
      this.logger.log(`socket connected: role=${payload.role} user=${payload.sub} | online drivers=${this.getOnlineDriverIds().length}`);
      if (payload.role === UserRole.DRIVER) {
        this.broadcastDriverPresenceUpdate();
      }
    } catch (e: any) {
      this.logger.warn(`socket ${client.id} rejected: token verify failed (${e?.message || e})`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data.userId) {
      const existing = this.connectedUsers.get(client.data.userId);
      existing?.socketIds.delete(client.id);
      if (existing && existing.socketIds.size === 0) {
        this.connectedUsers.delete(client.data.userId);
      }
      if (client.data.role === UserRole.DRIVER) {
        this.broadcastDriverPresenceUpdate();
      }
    }
  }

  getOnlineDriverIds(): string[] {
    return [...this.connectedUsers.entries()]
      .filter(([, user]) => user.role === UserRole.DRIVER && user.socketIds.size > 0)
      .map(([userId]) => userId);
  }

  private broadcastDriverPresenceUpdate() {
    if (!this.server) return;
    const driverIds = this.getOnlineDriverIds();
    this.server
      .to(`role:${UserRole.ADMIN}`)
      .to(`role:${UserRole.DISPATCHER}`)
      .emit('driver-presence:update', {
        driverIds,
        count: driverIds.length,
        timestamp: Date.now(),
      });
  }

  /** Close every socket of one account (it was deleted, disabled, rejected or given another role) */
  disconnectUser(userId: string) {
    this.server?.in(`user:${userId}`).disconnectSockets(true);
  }

  sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  sendToRole(role: string, event: string, data: any) {
    this.server.to(`role:${role}`).emit(event, data);
  }

  broadcastGpsUpdate(driverId: string, gpsData: any) {
    if (!this.server) return;
    // 只推给运营角色（管理员/调度/监控），避免把全队司机的实时坐标广播给客户/司机端。
    // 客户端/司机端通过各自的接口轮询自己有权看的定位。
    this.server
      .to(`role:${UserRole.ADMIN}`)
      .to(`role:${UserRole.DISPATCHER}`)
      .to(`role:${UserRole.MONITOR}`)
      .emit('gps:update', { driverId, ...gpsData });
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { time: Date.now() });
  }
}
