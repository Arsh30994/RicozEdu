import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { Router, type Router as ExpressRouter } from 'express';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AuditEvent, Membership, RefreshToken, Tenant, User } from './models';
import { ApiRequest, asyncRoute, HttpError } from './http';

const loginSchema = z.object({
  email: z.string().email().max(254).transform((email) => email.toLowerCase().trim()),
  password: z.string().min(12).max(128),
}).strict();

const refreshSchema = z.object({ refreshToken: z.string().min(40).max(200) }).strict();

const bootstrapSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(63),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().email().max(254).transform((email) => email.toLowerCase().trim()),
  adminPassword: z.string().min(12).max(128),
}).strict();

const accessTtlSeconds = (): number => {
  const value = Number(process.env.JWT_ACCESS_TTL_SEC ?? 900);
  if (!Number.isInteger(value) || value < 60 || value > 3600) {
    throw new Error('JWT_ACCESS_TTL_SEC must be an integer between 60 and 3600.');
  }
  return value;
};

const refreshTtlSeconds = (): number => {
  const value = Number(process.env.JWT_REFRESH_TTL_SEC ?? 604800);
  if (!Number.isInteger(value) || value < 600 || value > 2592000) {
    throw new Error('JWT_REFRESH_TTL_SEC must be an integer between 600 and 2592000.');
  }
  return value;
};

function accessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_ACCESS_SECRET must be at least 32 characters.');
  return secret;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function issueTokenPair(userId: Types.ObjectId, version: number, familyId?: string) {
  const sessionId = randomUUID();
  const accessToken = jwt.sign(
    { sub: userId.toString(), av: version, sid: sessionId },
    accessSecret(),
    { expiresIn: accessTtlSeconds() },
  );
  const refreshToken = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + refreshTtlSeconds() * 1000);
  await RefreshToken.create({
    userId,
    tokenHash: hashToken(refreshToken),
    familyId: familyId ?? randomUUID(),
    expiresAt,
  });
  return {
    accessToken,
    refreshToken,
    expiresIn: accessTtlSeconds(),
    tokenType: 'Bearer' as const,
  };
}

function verifyBootstrapToken(supplied: string | undefined): void {
  const expected = process.env.BOOTSTRAP_ADMIN_TOKEN;
  if (!expected || !supplied) {
    throw new HttpError(401, 'BOOTSTRAP_FORBIDDEN', 'A valid bootstrap token is required.');
  }
  const providedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new HttpError(401, 'BOOTSTRAP_FORBIDDEN', 'A valid bootstrap token is required.');
  }
}

export const authRouter: ExpressRouter = Router();

authRouter.post('/tenants', asyncRoute(async (request, response) => {
  verifyBootstrapToken(request.header('x-bootstrap-token'));
  const input = bootstrapSchema.parse(request.body);
  const tenant = await Tenant.create({ name: input.name, slug: input.slug });
  let createdUserId: Types.ObjectId | undefined;
  try {
    const user = await User.create({
      email: input.adminEmail,
      fullName: input.adminName,
      passwordHash: await argon2.hash(input.adminPassword),
    });
    createdUserId = user._id;
    await Membership.create({ userId: user._id, tenantId: tenant._id, role: 'owner' });
    await AuditEvent.create({
      actorUserId: user._id,
      action: 'tenant.bootstrap',
      resourceType: 'tenant',
      resourceId: tenant._id.toString(),
      correlationId: (request as ApiRequest).correlationId,
      metadata: { tenantSlug: tenant.slug },
    });
    response.status(201).json({
      tenant: { id: tenant._id.toString(), name: tenant.name, slug: tenant.slug },
      user: { id: user._id.toString(), email: user.email },
    });
  } catch (error) {
    await Promise.all([
      Tenant.deleteOne({ _id: tenant._id }),
      Membership.deleteOne({ tenantId: tenant._id }),
      ...(createdUserId ? [User.deleteOne({ _id: createdUserId })] : []),
    ]);
    throw error;
  }
}));

authRouter.post('/auth/login', asyncRoute(async (request, response) => {
  const input = loginSchema.parse(request.body);
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  let validPassword = false;
  if (user?.passwordHash) {
    try {
      validPassword = await argon2.verify(user.passwordHash, input.password);
    } catch {
      validPassword = false;
    }
  }
  if (!user || user.status !== 'active' || !validPassword) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }
  const tokens = await issueTokenPair(user._id, user.authorizationVersion);
  await AuditEvent.create({
    actorUserId: user._id,
    action: 'auth.login',
    resourceType: 'user',
    resourceId: user._id.toString(),
    correlationId: (request as ApiRequest).correlationId,
  });
  response.json({
    ...tokens,
    user: { id: user._id.toString(), email: user.email, name: user.fullName },
  });
}));

authRouter.post('/auth/refresh', asyncRoute(async (request, response) => {
  const { refreshToken } = refreshSchema.parse(request.body);
  const tokenHash = hashToken(refreshToken);
  const now = new Date();
  const prior = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now } },
    { new: false },
  );
  if (!prior) {
    const found = await RefreshToken.findOne({ tokenHash });
    if (found?.revokedAt) {
      await RefreshToken.updateMany({ familyId: found.familyId, revokedAt: null }, { $set: { revokedAt: now } });
      await User.updateOne({ _id: found.userId }, { $inc: { authorizationVersion: 1 } });
      throw new HttpError(401, 'REFRESH_REUSE', 'Refresh token reuse detected; the session has been revoked.');
    }
    throw new HttpError(401, 'INVALID_REFRESH', 'Invalid or expired refresh token.');
  }
  const user = await User.findOne({ _id: prior.userId, status: 'active' });
  if (!user) throw new HttpError(401, 'INVALID_REFRESH', 'Invalid or expired refresh token.');
  response.json(await issueTokenPair(user._id, user.authorizationVersion, prior.familyId));
}));

authRouter.post('/auth/logout', asyncRoute(async (request, response) => {
  const { refreshToken } = refreshSchema.parse(request.body);
  await RefreshToken.updateOne(
    { tokenHash: hashToken(refreshToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  response.status(204).end();
}));

authRouter.get('/me/memberships', asyncRoute(async (request, response) => {
  const userId = (request as ApiRequest).auth?.userId;
  if (!userId) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  const memberships = await Membership.find({ userId, status: 'active' })
    .populate('tenantId', 'name status')
    .sort({ createdAt: 1 });
  response.json(
    memberships
      .filter((membership) => {
        const tenant = membership.tenantId as unknown as { status?: string };
        return tenant?.status === 'active';
      })
      .map((membership) => {
        const tenant = membership.tenantId as unknown as { _id: Types.ObjectId; name: string };
        return {
          membershipId: membership._id.toString(),
          tenantId: tenant._id.toString(),
          tenantName: tenant.name,
          role: membership.role,
          status: membership.status,
        };
      }),
  );
}));

authRouter.get('/tenants/current', asyncRoute(async (request, response) => {
  const apiRequest = request as ApiRequest;
  if (!apiRequest.tenant) throw new HttpError(400, 'TENANT_REQUIRED', 'X-Tenant-Id is required.');
  const tenant = await Tenant.findById(apiRequest.tenant.tenantId).select('name slug status');
  if (!tenant) throw new HttpError(404, 'TENANT_NOT_FOUND', 'Workspace not found.');
  response.json({
    id: tenant._id.toString(),
    name: tenant.name,
    slug: tenant.slug,
    role: apiRequest.tenant.role,
  });
}));

export { accessSecret };
