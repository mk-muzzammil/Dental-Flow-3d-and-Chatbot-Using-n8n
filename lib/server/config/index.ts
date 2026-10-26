import 'server-only';

export class AppError extends Error {
  constructor(
    public code: string,
    public status = 503,
    public service?: string,
  ) {
    super(code);
    this.name = 'AppError';
  }
}

export const env = (name: string, fallback = '') => process.env[name]?.trim() || fallback;
export function required(name: string) {
  const value = env(name);
  if (!value) throw new AppError(`missing_${name.toLowerCase()}`);
  return value;
}
export function appMode(): 'demo' | 'live' {
  const mode = env('APP_MODE', 'demo');
  if (mode !== 'demo' && mode !== 'live') throw new AppError('invalid_app_mode');
  return mode;
}
export function planTier(): 'hobby' | 'pro' {
  const plan = env('VERCEL_PLAN', 'hobby');
  if (plan !== 'hobby' && plan !== 'pro') throw new AppError('invalid_vercel_plan');
  return plan;
}
export function appUrl() {
  const url = new URL(required('APP_URL'));
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new AppError('invalid_app_url');
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  )
    throw new AppError('https_required');
  return url.origin;
}
export const clinicDefaults = () => ({
  CLINIC_NAME: env('CLINIC_NAME', 'Smile Dental Clinic'),
  CLINIC_ADDRESS: env('CLINIC_ADDRESS', '12 Main Boulevard, Lahore'),
  CLINIC_PHONE: env('CLINIC_PHONE', '+92 300 000 0000'),
  CLINIC_MAP_URL: env('CLINIC_MAP_URL', 'https://maps.app.goo.gl/fWLCAxLLaZQMfbTU6'),
  CURRENCY: env('CLINIC_CURRENCY', 'PKR'),
  TIMEZONE: env('CLINIC_TIMEZONE', 'Asia/Karachi'),
  PUBLIC_BASE: appUrl(),
  BOOKING_URL: appUrl(),
});
export const safeError = (error: unknown) =>
  error instanceof AppError
    ? { code: error.code, service: error.service, status: error.status }
    : {
        code: error instanceof Error && /abort|timeout/i.test(error.name) ? 'timeout' : 'unexpected_error',
        status: 503,
      };

export function deadline(ms: number, parent?: AbortSignal) {
  return parent ? AbortSignal.any([parent, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
}
export function checkSignal(signal?: AbortSignal) {
  signal?.throwIfAborted();
}
