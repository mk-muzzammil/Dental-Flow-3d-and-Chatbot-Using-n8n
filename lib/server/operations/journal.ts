import 'server-only';
import { collection, initializeDatabase, retentionDate } from '../db';
import { AppError, safeError, checkSignal } from '../config';
import { encrypt, decrypt, digest, type Ciphertext } from '../security';
import { withLease } from './lease';
export type Operation = {
  _id: string;
  type: string;
  fingerprint: string;
  status: 'running' | 'complete' | 'failed' | 'uncertain';
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  steps: Record<string, { state: 'attempted' | 'done'; value?: Ciphertext }>;
  context?: Ciphertext;
  result?: Ciphertext;
  error?: { code: string; service?: string };
  bookingIdentity?: string;
  reference?: string;
};
export type Journal = {
  id: string;
  context<T>(): T | undefined;
  saveContext(value: unknown): Promise<void>;
  setIdentity(identity: string, reference?: string): Promise<void>;
  step<T>(
    name: string,
    effect: () => Promise<T>,
    reconcile?: () => Promise<{ found: true; value: T } | { found: false }>,
    uncertain?: boolean,
  ): Promise<T>;
};
export async function operate<T>(
  type: string,
  key: string,
  fingerprint: string,
  run: (journal: Journal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  await initializeDatabase();
  const id = digest(`${type}:${key}`),
    operations = await collection<Operation>('operation_journal');
  return withLease(
    `operation:${id}`,
    async (assertHeld) => {
      let op = await operations.findOne({ _id: id });
      if (op && op.fingerprint !== fingerprint) throw new AppError('idempotency_conflict', 409);
      if (op?.result && op.status === 'complete') return JSON.parse(decrypt(op.result, `result:${id}`)) as T;
      if (!op) {
        op = {
          _id: id,
          type,
          fingerprint,
          status: 'running',
          createdAt: new Date(),
          updatedAt: new Date(),
          steps: {},
        };
        await operations.insertOne(op);
      }
      const journal: Journal = {
        id,
        context: <V>() =>
          op!.context ? (JSON.parse(decrypt(op!.context, `context:${id}`)) as V) : undefined,
        saveContext: async (value) => {
          const context = encrypt(JSON.stringify(value), `context:${id}`);
          await operations.updateOne({ _id: id }, { $set: { context, updatedAt: new Date() } });
          op!.context = context;
        },
        setIdentity: async (identity, reference) => {
          await operations.updateOne(
            { _id: id },
            { $set: { bookingIdentity: identity, ...(reference ? { reference } : {}) } },
          );
        },
        step: async <V>(
          name: string,
          effect: () => Promise<V>,
          reconcile?: () => Promise<{ found: true; value: V } | { found: false }>,
          uncertain = false,
        ) => {
          if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) throw new AppError('invalid_operation_step');
          await assertHeld();
          checkSignal(signal);
          const previous = op!.steps[name];
          if (previous?.state === 'done')
            return previous.value
              ? (JSON.parse(decrypt(previous.value, `step:${id}:${name}`)) as V)
              : (undefined as V);
          let recovered: { found: true; value: V } | { found: false } = { found: false };
          if (previous && reconcile) recovered = await reconcile();
          if (previous && !recovered.found && uncertain) throw new AppError('outcome_uncertain', 409);
          await operations.updateOne(
            { _id: id },
            { $set: { [`steps.${name}`]: { state: 'attempted' }, updatedAt: new Date() } },
          );
          op!.steps[name] = { state: 'attempted' };
          let value: V;
          try {
            value = recovered.found ? recovered.value : await effect();
          } catch (error) {
            if (uncertain && !(error instanceof AppError)) throw new AppError('outcome_uncertain', 409);
            throw error;
          }
          const saved: Operation['steps'][string] = {
            state: 'done',
            ...(value === undefined ? {} : { value: encrypt(JSON.stringify(value), `step:${id}:${name}`) }),
          };
          await operations.updateOne(
            { _id: id },
            { $set: { [`steps.${name}`]: saved, updatedAt: new Date() } },
          );
          op!.steps[name] = saved;
          return value;
        },
      };
      try {
        const result = await run(journal);
        await operations.updateOne(
          { _id: id },
          {
            $set: {
              status: 'complete',
              result: encrypt(JSON.stringify(result), `result:${id}`),
              updatedAt: new Date(),
              expiresAt: retentionDate(),
            },
            $unset: { error: '' },
          },
        );
        return result;
      } catch (error) {
        const safe = safeError(error);
        await operations.updateOne(
          { _id: id },
          {
            $set: {
              status: safe.code === 'outcome_uncertain' ? 'uncertain' : 'failed',
              error: { code: safe.code, ...(safe.service ? { service: safe.service } : {}) },
              updatedAt: new Date(),
            },
            $unset: { expiresAt: '' },
          },
        );
        throw error;
      }
    },
    { signal },
  );
}
