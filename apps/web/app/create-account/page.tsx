import Link from 'next/link';

export default function CreateAccountPage() {
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Create an account</h1>
          <p>Account access is managed by your institution.</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <p>
          Contact your institution administrator to create your account and
          assign your student or teacher role. Once your account is ready, sign
          in with your work email.
        </p>
        <div className="actions" style={{ marginTop: '1.1rem' }}>
          <Link className="btn" href="/login">
            Back to sign in
          </Link>
        </div>
      </div>
    </section>
  );
}