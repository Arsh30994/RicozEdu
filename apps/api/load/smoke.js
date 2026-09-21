import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.API_BASE || 'http://localhost:4000';
const EMAIL = __ENV.EMAIL || 'admin@example.com';
const PASSWORD = __ENV.PASSWORD || 'Password12345!';
const TENANT_ID = __ENV.TENANT_ID || '';
const STUDENT_ID = __ENV.STUDENT_ID || '';

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  const loginRes = http.post(
    `${BASE}/v1/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(loginRes, { 'login 200': (r) => r.status === 200 });
  const accessToken = loginRes.json('accessToken');

  if (!TENANT_ID || !STUDENT_ID) {
    console.warn('Set TENANT_ID and STUDENT_ID for student GET smoke');
    return;
  }

  const studentRes = http.get(`${BASE}/v1/students/${STUDENT_ID}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Tenant-Id': TENANT_ID,
    },
  });
  check(studentRes, { 'get student 200': (r) => r.status === 200 });
  sleep(0.1);
}
