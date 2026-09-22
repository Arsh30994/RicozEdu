import { createHash, randomBytes, randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import { AccessTokenClaims } from '@ricozedu/shared-auth';
import { DatabaseService } from '../database/database.service';
import { ApiError } from '../common/api-error';
import { AuditWriter } from '../common/audit-writer';
import { OutboxWriter } from '../common/outbox-writer';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  private accessSecret(): string {
    const s = process.env.JWT_ACCESS_SECRET;
    if (!s || s.length < 32) throw new Error('JWT_ACCESS_SECRET invalid');
    return s;
  }

  private accessTtl(): number {
    return Number(process.env.JWT_ACCESS_TTL_SEC ?? 900);
  }

  private refreshTtl(): number {
    return Number(process.env.JWT_REFRESH_TTL_SEC ?? 604800);
  }

  hashRefreshToken(token: string): Buffer {
    return createHash('sha256').update(token).digest();
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  signAccess(claims: AccessTokenClaims): string {
    return jwt.sign(claims, this.accessSecret(), {
      expiresIn: this.accessTtl(),
    });
  }

  verifyAccess(token: string): AccessTokenClaims {
    try {
      const payload = jwt.verify(token, this.accessSecret()) as AccessTokenClaims;
      if (!payload.sub || typeof payload.av !== 'number' || !payload.sid) {
        throw new ApiError('INVALID_TOKEN', 'Invalid access token', HttpStatus.UNAUTHORIZED);
      }
      return payload;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError('INVALID_TOKEN', 'Invalid or expired access token', HttpStatus.UNAUTHORIZED);
    }
  }

  private async issuePair(
    userId: string,
    av: number,
    familyId?: string,
  ): Promise<TokenPair & { refreshTokenId: string; familyId: string }> {
    const sid = randomUUID();
    const accessToken = this.signAccess({ sub: userId, av, sid });
    const refreshToken = randomBytes(48).toString('base64url');
    const tokenHash = this.hashRefreshToken(refreshToken);
    const fam = familyId ?? randomUUID();
    const expiresAt = new Date(Date.now() + this.refreshTtl() * 1000);

    const r = await this.db.query<{ id: string }>(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [userId, tokenHash, fam, expiresAt.toISOString()],
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtl(),
      tokenType: 'Bearer',
      refreshTokenId: r.rows[0]!.id,
      familyId: fam,
    };
  }

  async login(
    email: string,
    password: string,
    correlationId: string,
  ): Promise<TokenPair & { user: { id: string; email: string } }> {
    const users = await this.db.query<{
      id: string;
      email: string;
      password_hash: string;
      status: string;
      authorization_version: number;
    }>(
      `SELECT id, email, password_hash, status, authorization_version
       FROM users WHERE lower(email) = lower($1)`,
      [email],
    );
    const user = users.rows[0];
    if (!user || user.status !== 'active') {
      throw new ApiError('INVALID_CREDENTIALS', 'Invalid email or password', HttpStatus.UNAUTHORIZED);
    }
    const ok = await this.verifyPassword(user.password_hash, password);
    if (!ok) {
      throw new ApiError('INVALID_CREDENTIALS', 'Invalid email or password', HttpStatus.UNAUTHORIZED);
    }

    const pair = await this.issuePair(user.id, user.authorization_version);

    await this.db.withMigratorTx(async (client) => {
      await this.audit.write(client, {
        tenantId: null,
        actorUserId: user.id,
        actorMembershipId: null,
        action: 'auth.login',
        resourceType: 'user',
        resourceId: user.id,
        correlationId,
      });
      await this.outbox.write(client, {
        tenantId: null,
        aggregateType: 'user',
        aggregateId: user.id,
        eventType: 'auth.login',
        payload: { userId: user.id },
        idempotencyKey: `auth.login:${user.id}:${pair.refreshTokenId}`,
      });
    });

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      expiresIn: pair.expiresIn,
      tokenType: 'Bearer',
      user: { id: user.id, email: user.email },
    };
  }

  async refresh(refreshToken: string, correlationId: string): Promise<TokenPair> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const found = await this.db.query<{
      id: string;
      user_id: string;
      family_id: string;
      expires_at: Date;
      revoked_at: Date | null;
      authorization_version: number;
    }>(
      `SELECT rt.id, rt.user_id, rt.family_id, rt.expires_at, rt.revoked_at,
              u.authorization_version
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`,
      [tokenHash],
    );
    const row = found.rows[0];
    if (!row) {
      throw new ApiError('INVALID_REFRESH', 'Invalid refresh token', HttpStatus.UNAUTHORIZED);
    }

    if (row.revoked_at) {
      // Reuse detection: revoke entire family + bump av
      await this.db.query(
        `UPDATE refresh_tokens SET revoked_at = now()
         WHERE family_id = $1 AND revoked_at IS NULL`,
        [row.family_id],
      );
      await this.db.query(
        `UPDATE users SET authorization_version = authorization_version + 1,
                           updated_at = now()
         WHERE id = $1`,
        [row.user_id],
      );
      await this.db.withMigratorTx(async (client) => {
        await this.audit.write(client, {
          tenantId: null,
          actorUserId: row.user_id,
          actorMembershipId: null,
          action: 'auth.refresh_reuse',
          resourceType: 'user',
          resourceId: row.user_id,
          correlationId,
          metadata: { familyId: row.family_id },
        });
      });
      throw new ApiError(
        'REFRESH_REUSE',
        'Refresh token reuse detected; session family revoked',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new ApiError('INVALID_REFRESH', 'Refresh token expired', HttpStatus.UNAUTHORIZED);
    }

    const pair = await this.issuePair(
      row.user_id,
      row.authorization_version,
      row.family_id,
    );

    await this.db.query(
      `UPDATE refresh_tokens
       SET revoked_at = now(), replaced_by = $2
       WHERE id = $1`,
      [row.id, pair.refreshTokenId],
    );

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      expiresIn: pair.expiresIn,
      tokenType: 'Bearer',
    };
  }

  async logout(refreshToken: string, correlationId: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const found = await this.db.query<{
      id: string;
      user_id: string;
      family_id: string;
    }>(
      `SELECT id, user_id, family_id FROM refresh_tokens WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = found.rows[0];
    if (!row) return;

    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = now()
       WHERE family_id = $1 AND revoked_at IS NULL`,
      [row.family_id],
    );
    await this.db.query(
      `UPDATE users SET authorization_version = authorization_version + 1,
                         updated_at = now()
       WHERE id = $1`,
      [row.user_id],
    );

    await this.db.withMigratorTx(async (client) => {
      await this.audit.write(client, {
        tenantId: null,
        actorUserId: row.user_id,
        actorMembershipId: null,
        action: 'auth.logout',
        resourceType: 'user',
        resourceId: row.user_id,
        correlationId,
      });
      await this.outbox.write(client, {
        tenantId: null,
        aggregateType: 'user',
        aggregateId: row.user_id,
        eventType: 'auth.logout',
        payload: { userId: row.user_id },
        idempotencyKey: `auth.logout:${row.id}`,
      });
    });
  }
}
