import 'server-only';
import { MongoClient, type Db, type Document, type Collection } from 'mongodb';
import { required, env } from '../config';

const state = globalThis as typeof globalThis & {
  dentalMongo?: { uri: string; promise: Promise<MongoClient> };
  dentalIndexes?: Promise<void>;
  dentalIndexDatabase?: string;
};
export async function database(): Promise<Db> {
  const uri = required('MONGODB_URI');
  if (!state.dentalMongo || state.dentalMongo.uri !== uri) {
    state.dentalIndexes = undefined;
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 60_000,
      // Atlas DNS/TLS warm-up on local networks can exceed five seconds.
      // Keep waits bounded without growing the per-instance connection pool.
      connectTimeoutMS: 10_000,
      serverSelectionTimeoutMS: 15_000,
      waitQueueTimeoutMS: 10_000,
    });
    const promise = client.connect().catch((error) => {
      state.dentalMongo = undefined;
      throw error;
    });
    state.dentalMongo = { uri, promise };
  }
  return (await state.dentalMongo.promise).db(env('MONGODB_DB', 'dentalflow'));
}
export async function collection<T extends Document>(name: string): Promise<Collection<T>> {
  return (await database()).collection<T>(name);
}
export async function initializeDatabase() {
  const db = await database();
  if (state.dentalIndexDatabase !== db.databaseName) {
    state.dentalIndexes = undefined;
    state.dentalIndexDatabase = db.databaseName;
  }
  state.dentalIndexes ??= (async () => {
    await Promise.all([
      ...[
        'admin_sessions',
        'oauth_transactions',
        'auth_rate_limits',
        'cron_runs',
        'cron_slots',
        'audit_events',
        'operation_journal',
        'migration_backups',
      ].map((name) => db.collection(name).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })),
      db.collection('booking_reservations').createIndex({calendarId:1,date:1}),
      db.collection('booking_private').createIndex({ sheetId: 1, bookingId: 1 }, { unique: true }),
      db.collection('execution_leases').createIndex({ until: 1 }, { expireAfterSeconds: 0 }),
      db.collection('cron_runs').createIndex({ jobId: 1, startedAt: -1, _id: -1 }),
      db.collection('cron_runs').createIndex({ status: 1, startedAt: -1 }),
      db.collection('cron_runs').createIndex({ dedupeKey: 1 }, { unique: true }),
      db.collection('cron_slots').createIndex({ jobId: 1, periodId: 1, scheduledAt: 1 }, { unique: true }),
      db.collection('operation_journal').createIndex({ status: 1, updatedAt: -1 }),
      db.collection('admin_sessions').createIndex({ refreshHash: 1 }, { unique: true }),
    ]);
  })().catch((error) => {
    state.dentalIndexes = undefined;
    throw error;
  });
  await state.dentalIndexes;
  return db;
}
export const retentionDate = (days = 30) => new Date(Date.now() + days * 86_400_000);
