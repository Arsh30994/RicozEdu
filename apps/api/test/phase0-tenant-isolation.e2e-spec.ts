import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { CorrelationIdMiddleware } from '../src/common/correlation-id.middleware';

/**
 * Requires DATABASE_URL, DATABASE_MIGRATE_URL, REDIS_URL, JWT secrets, BOOTSTRAP_ADMIN_TOKEN.
 * Run migrations before this suite.
 */
describe('Phase 0 tenant isolation (e2e)', () => {
  let app: INestApplication;
  const bootstrapToken = process.env.BOOTSTRAP_ADMIN_TOKEN ?? 'dev-bootstrap-token-change-me';

  beforeAll(async () => {
    process.env.OUTBOX_RELAY_DISABLED = '1';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(new CorrelationIdMiddleware().use.bind(new CorrelationIdMiddleware()));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('isolates students across two tenants', async () => {
    const suffix = Date.now().toString(36);

    const tenantA = await request(app.getHttpServer())
      .post('/v1/tenants')
      .set('X-Bootstrap-Token', bootstrapToken)
      .set('Idempotency-Key', `boot-a-${suffix}`)
      .send({
        slug: `tenant-a-${suffix}`,
        name: 'Tenant A',
        adminEmail: `admin-a-${suffix}@example.com`,
        adminPassword: 'Password12345!',
        adminGivenName: 'Ada',
        adminFamilyName: 'Admin',
      })
      .expect(201);

    const tenantB = await request(app.getHttpServer())
      .post('/v1/tenants')
      .set('X-Bootstrap-Token', bootstrapToken)
      .set('Idempotency-Key', `boot-b-${suffix}`)
      .send({
        slug: `tenant-b-${suffix}`,
        name: 'Tenant B',
        adminEmail: `admin-b-${suffix}@example.com`,
        adminPassword: 'Password12345!',
        adminGivenName: 'Bob',
        adminFamilyName: 'Admin',
      })
      .expect(201);

    const loginA = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: `admin-a-${suffix}@example.com`,
        password: 'Password12345!',
      })
      .expect(200);

    const loginB = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: `admin-b-${suffix}@example.com`,
        password: 'Password12345!',
      })
      .expect(200);

    const tokenA = loginA.body.accessToken as string;
    const tokenB = loginB.body.accessToken as string;
    const idA = tenantA.body.id as string;
    const idB = tenantB.body.id as string;

    const instA = await request(app.getHttpServer())
      .post('/v1/institutions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Tenant-Id', idA)
      .send({ code: 'MAIN', name: 'Main Campus Org' })
      .expect(201);

    const instB = await request(app.getHttpServer())
      .post('/v1/institutions')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Tenant-Id', idB)
      .send({ code: 'MAIN', name: 'Main Campus Org' })
      .expect(201);

    const studentA = await request(app.getHttpServer())
      .post('/v1/students')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Tenant-Id', idA)
      .set('Idempotency-Key', `stu-a-${suffix}`)
      .send({
        institutionId: instA.body.id,
        studentNumber: `A-${suffix}`,
        person: {
          givenName: 'Sam',
          familyName: 'Student',
          primaryEmail: `sam-a-${suffix}@example.com`,
        },
      })
      .expect(201);

    // Tenant B cannot read Tenant A student (404)
    await request(app.getHttpServer())
      .get(`/v1/students/${studentA.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Tenant-Id', idB)
      .expect(404);

    // Tenant A can read own student
    await request(app.getHttpServer())
      .get(`/v1/students/${studentA.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Tenant-Id', idA)
      .expect(200);

    // Reject body.tenantId
    await request(app.getHttpServer())
      .post('/v1/students')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Tenant-Id', idB)
      .send({
        tenantId: idA,
        institutionId: instB.body.id,
        studentNumber: `B-${suffix}`,
        person: { givenName: 'Pat', familyName: 'Student' },
      })
      .expect(400);

    // Cross-tenant header with other tenant's token should be forbidden
    await request(app.getHttpServer())
      .get('/v1/tenants/current')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Tenant-Id', idB)
      .expect(403);
  });
});
