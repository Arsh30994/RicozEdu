# Phase 0 threat model

| Threat | Mitigation |
|--------|------------|
| Cross-tenant IDOR | FORCE RLS + membership guard + uniform 404 |
| Privilege escalation | Server-side permissions; ignore client roles |
| Token theft | Short access TTL; refresh rotation; reuse detection |
| SQL injection | Parameterized queries |
| Secret leakage | Redacted logs; no tokens in URLs |
| RLS bypass | Non-superuser app role; CI RLS tests |
| Bootstrap abuse | BOOTSTRAP_ADMIN_TOKEN (dev); audited |
| Enumeration | Consistent errors; basic login rate limit |
