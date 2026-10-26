'use client';
import { useAdminData, useClinicTime } from './client';
type RecordView = {
  _id: string;
  type: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  error?: { code: string; service?: string };
  bookingIdentity?: string;
  reference?: string;
};
export function Operations() {
  const { displayTime, timezone } = useClinicTime();
  const { data, error } = useAdminData<{ operations: RecordView[] }>('/api/admin/operations', true);
  return (
    <>
      <p className="eyebrow">RECOVERY</p>
      <h1>Operations needing review</h1>
      <p className="muted">
        Failed, uncertain, and running operations. Booking identities are hashed; patient details and
        credentials are hidden.
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <section className="card">
        <p>
          An uncertain email is never resent automatically. Compare the owner’s Sent folder and the clinic
          records before taking further action. A retry of the original booking request resumes its recorded
          steps.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Failure</th>
                <th>Operation ID</th>
              </tr>
            </thead>
            <tbody>
              {data?.operations.length ? (
                data.operations.map((op) => (
                  <tr key={op._id}>
                    <td>
                      {op.type}
                      <small>{op.reference}</small>
                    </td>
                    <td>
                      <span className="badge">{op.status}</span>
                    </td>
                    <td>{displayTime(op.updatedAt)}</td>
                    <td>{op.error?.code || '—'}</td>
                    <td>
                      <code>{op._id}</code>
                      {op.bookingIdentity ? <small>Booking: {op.bookingIdentity}</small> : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>{data ? 'No operations need review.' : 'Loading operations…'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
