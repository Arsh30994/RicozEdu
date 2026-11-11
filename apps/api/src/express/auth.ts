import { createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { Router, type Router as ExpressRouter } from 'express';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { AuditEvent, Membership, OAuthLoginCode, RefreshToken, Tenant, User } from './models';
import { ApiRequest, asyncRoute, HttpError } from './http';

export const MIN_PASSWORD_LENGTH = 8;
const GOOGLE_OAUTH_STATE_COOKIE = 'ricozedu_google_oauth_state';

const loginSchema = z.object({
  email: z.string().email().max(254).transform((email) => email.toLowerCase().trim()),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(128),
}).strict();

const refreshSchema = z.object({ refreshToken: z.string().min(40).max(200) }).strict();

const bootstrapSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(63),
  institutionType: z.enum(['school', 'higher_ed']).default('higher_ed'),
  timezone: z.string().trim().min(1).max(100).default('Asia/Kolkata'),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().email().max(254).transform((email) => email.toLowerCase().trim()),
  adminPassword: z.string().min(MIN_PASSWORD_LENGTH).max(128),
}).strict();

const googleCallbackSchema = z.object({
  code: z.string().min(20).max(4000),
  state: z.string().min(20).max(4000),
}).strict();

const googleExchangeSchema = z.object({ code: z.string().min(40).max(200) }).strict();

const googleTokenSchema = z.object({ id_token: z.string().min(100).max(10000) }).passthrough();

const googleJwkSetSchema = z.object({
  keys: z.array(z.object({ kid: z.string(), kty: z.string() }).passthrough()).min(1),
});

const googleClaimsSchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.string().email().max(254).transform((email) => email.toLowerCase().trim()),
  email_verified: z.union([z.boolean(), z.literal('true'), z.literal('false')]).transform((value) => value === true || value === 'true'),
  name: z.string().trim().min(1).max(120).optional(),
});

type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  webAppUrl: string;
};

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

function requireDatabaseConnection(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'The RicozEdu database is unavailable. Start MongoDB and try again.');
  }
}

function readCookie(request: ApiRequest, name: string): string | undefined {
  const value = request.headers.cookie
    ?.split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function securelyMatches(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
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

function googleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  const webAppUrl = process.env.WEB_APP_URL?.trim() ?? 'http://localhost:3000';
  if (!clientId || !clientSecret || !redirectUri) {
    throw new HttpError(503, 'GOOGLE_OAUTH_NOT_CONFIGURED', 'Google sign-in is not configured for this environment.');
  }
  try {
    const redirect = new URL(redirectUri);
    const app = new URL(webAppUrl);
    if (!['http:', 'https:'].includes(redirect.protocol) || !['http:', 'https:'].includes(app.protocol)) throw new Error('protocol');
  } catch {
    throw new HttpError(500, 'GOOGLE_OAUTH_CONFIGURATION_ERROR', 'Google OAuth URLs must be valid HTTP or HTTPS URLs.');
  }
  return { clientId, clientSecret, redirectUri, webAppUrl };
}

function googleLoginUrl(webAppUrl: string, params: Record<string, string>): string {
  const url = new URL('/login', webAppUrl);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

async function verifyGoogleIdToken(idToken: string, clientId: string): Promise<z.output<typeof googleClaimsSchema>> {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded === 'string' || typeof decoded.header.kid !== 'string' || decoded.header.alg !== 'RS256') {
    throw new HttpError(401, 'INVALID_GOOGLE_ID_TOKEN', 'Google returned an invalid identity token.');
  }
  let jwks: z.output<typeof googleJwkSetSchema>;
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!response.ok) throw new Error('JWKS request failed');
    jwks = googleJwkSetSchema.parse(await response.json());
  } catch {
    throw new HttpError(503, 'GOOGLE_IDENTITY_UNAVAILABLE', 'Google identity verification is temporarily unavailable.');
  }
  const key = jwks.keys.find((entry) => entry.kid === decoded.header.kid);
  if (!key) throw new HttpError(401, 'INVALID_GOOGLE_ID_TOKEN', 'Google returned an unrecognized identity key.');
  let claims: jwt.JwtPayload;
  try {
    const verified = jwt.verify(idToken, createPublicKey({ key, format: 'jwk' }), {
      algorithms: ['RS256'],
      audience: clientId,
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
    });
    if (typeof verified === 'string') throw new Error('Invalid token claims');
    claims = verified;
  } catch {
    throw new HttpError(401, 'INVALID_GOOGLE_ID_TOKEN', 'Google identity verification failed.');
  }
  const profile = googleClaimsSchema.parse(claims);
  if (!profile.email_verified) throw new HttpError(401, 'GOOGLE_EMAIL_UNVERIFIED', 'Google must provide a verified email address.');
  return profile;
}

async function createLoginExchangeCode(userId: Types.ObjectId): Promise<string> {
  const code = randomBytes(32).toString('base64url');
  await OAuthLoginCode.create({
    userId,
    codeHash: hashToken(code),
    expiresAt: new Date(Date.now() + 2 * 60 * 1000),
  });
  return code;
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
  const tenant = await Tenant.create({
    name: input.name,
    slug: input.slug,
    institutionType: input.institutionType,
    timezone: input.timezone,
  });
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
      tenant: {
        id: tenant._id.toString(), name: tenant.name, slug: tenant.slug,
        institutionType: tenant.institutionType, timezone: tenant.timezone,
      },
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
  requireDatabaseConnection();
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

authRouter.get('/auth/google', asyncRoute(async (_request, response) => {
  const config = googleOAuthConfig();
  const state = jwt.sign({ purpose: 'google-oauth', nonce: randomUUID() }, accessSecret(), { expiresIn: 600 });
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorization.searchParams.set('client_id', config.clientId);
  authorization.searchParams.set('redirect_uri', config.redirectUri);
  authorization.searchParams.set('response_type', 'code');
  authorization.searchParams.set('scope', 'openid email profile');
  authorization.searchParams.set('state', state);
  authorization.searchParams.set('prompt', 'select_account');
  response.cookie(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000,
    path: '/v1/auth/google',
  });
  response.redirect(302, authorization.toString());
}));

authRouter.get('/auth/google/callback', asyncRoute(async (request, response) => {
  const config = googleOAuthConfig();
  let input: z.output<typeof googleCallbackSchema>;
  try {
    input = googleCallbackSchema.parse(request.query);
    if (!securelyMatches(readCookie(request as ApiRequest, GOOGLE_OAUTH_STATE_COOKIE), input.state)) throw new Error('State cookie mismatch');
    const state = jwt.verify(input.state, accessSecret());
    if (typeof state === 'string' || state.purpose !== 'google-oauth' || typeof state.nonce !== 'string') throw new Error('Invalid state');
  } catch {
    return response.redirect(302, googleLoginUrl(config.webAppUrl, { auth_error: 'Google sign-in request expired or was invalid. Try again.' }));
  }
  response.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, { path: '/v1/auth/google' });

  let idToken: string;
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: input.code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) throw new Error('Token exchange failed');
    idToken = googleTokenSchema.parse(await tokenResponse.json()).id_token;
  } catch {
    return response.redirect(302, googleLoginUrl(config.webAppUrl, { auth_error: 'Google sign-in could not be completed. Try again.' }));
  }

  let profile: z.output<typeof googleClaimsSchema>;
  try {
    profile = await verifyGoogleIdToken(idToken, config.clientId);
  } catch (error) {
    const message = error instanceof HttpError ? error.message : 'Google sign-in could not be completed. Try again.';
    return response.redirect(302, googleLoginUrl(config.webAppUrl, { auth_error: message }));
  }
  try {
    requireDatabaseConnection();
  } catch (error) {
    const message = error instanceof HttpError ? error.message : 'Google sign-in could not be completed. Try again.';
    return response.redirect(302, googleLoginUrl(config.webAppUrl, { auth_error: message }));
  }
  let user = await User.findOne({ $or: [{ googleSubject: profile.sub }, { email: profile.email }] }).select('+googleSubject');
  if (!user) {
    user = await User.create({
      email: profile.email,
      fullName: profile.name ?? profile.email.split('@')[0],
      googleSubject: profile.sub,
      passwordHash: await argon2.hash(randomBytes(48).toString('base64url')),
    });
  } else if (user.status !== 'active') {
    return response.redirect(302, googleLoginUrl(config.webAppUrl, { auth_error: 'This account is disabled. Contact your institution administrator.' }));
  } else if (!user.googleSubject) {
    user.googleSubject = profile.sub;
    await user.save();
  } else if (user.googleSubject !== profile.sub) {
    return response.redirect(302, googleLoginUrl(config.webAppUrl, { auth_error: 'This email address is linked to a different Google account.' }));
  }
  const code = await createLoginExchangeCode(user._id);
  response.redirect(302, googleLoginUrl(config.webAppUrl, { google_oauth_code: code }));
}));

authRouter.post('/auth/google/exchange', asyncRoute(async (request, response) => {
  const input = googleExchangeSchema.parse(request.body);
  requireDatabaseConnection();
  const now = new Date();
  const loginCode = await OAuthLoginCode.findOneAndUpdate(
    { codeHash: hashToken(input.code), consumedAt: null, expiresAt: { $gt: now } },
    { $set: { consumedAt: now } },
    { new: false },
  );
  if (!loginCode) throw new HttpError(401, 'INVALID_GOOGLE_LOGIN_CODE', 'Google sign-in has expired. Try again.');
  const user = await User.findOne({ _id: loginCode.userId, status: 'active' });
  if (!user) throw new HttpError(401, 'INVALID_GOOGLE_LOGIN_CODE', 'Google sign-in has expired. Try again.');
  const tokens = await issueTokenPair(user._id, user.authorizationVersion);
  await AuditEvent.create({
    actorUserId: user._id,
    action: 'auth.google_login',
    resourceType: 'user',
    resourceId: user._id.toString(),
    correlationId: (request as ApiRequest).correlationId,
  });
  response.json({ ...tokens, user: { id: user._id.toString(), email: user.email, name: user.fullName } });
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
          permissions: membership.permissions ?? [],
          status: membership.status,
        };
      }),
  );
}));

authRouter.get('/tenants/current', asyncRoute(async (request, response) => {
  const apiRequest = request as ApiRequest;
  if (!apiRequest.tenant) throw new HttpError(400, 'TENANT_REQUIRED', 'X-Tenant-Id is required.');
  const tenant = await Tenant.findById(apiRequest.tenant.tenantId).select('name slug institutionType timezone status');
  if (!tenant) throw new HttpError(404, 'TENANT_NOT_FOUND', 'Workspace not found.');
  response.json({
    id: tenant._id.toString(),
    name: tenant.name,
    slug: tenant.slug,
    institutionType: tenant.institutionType,
    timezone: tenant.timezone,
    role: apiRequest.tenant.role,
    permissions: apiRequest.tenant.permissions,
  });
}));

export { accessSecret };
