import 'server-only';
import { randomUUID } from 'node:crypto';
import { collection } from '../db';
import { AppError, checkSignal } from '../config';

type Lease = { _id: string; owner: string; until: Date };
export async function withLease<T>(
  key: string,
  work: (assertHeld: () => Promise<void>) => Promise<T>,
  options: { seconds?: number; signal?: AbortSignal } = {},
) {
  checkSignal(options.signal);
  const leases = await collection<Lease>('execution_leases');
  const owner = randomUUID(),
    seconds = options.seconds ?? 330;
  try {
    const result = await leases.findOneAndUpdate(
      { _id: key, until: { $lte: new Date() } },
      { $set: { owner, until: new Date(Date.now() + seconds * 1000) } },
      { upsert: true, returnDocument: 'after' },
    );
    if (result?.owner !== owner) throw new AppError('already_running', 409);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
      throw new AppError('already_running', 409);
    throw error;
  }
  const assertHeld = async () => {
    checkSignal(options.signal);
    const renewed = await leases.updateOne(
      { _id: key, owner, until: { $gt: new Date() } },
      { $set: { until: new Date(Date.now() + seconds * 1000) } },
    );
    if (!renewed.matchedCount) throw new AppError('lease_lost', 409);
  };
  try {
    return await work(assertHeld);
  } finally {
    await leases.deleteOne({ _id: key, owner }).catch(() => undefined);
  }
}
