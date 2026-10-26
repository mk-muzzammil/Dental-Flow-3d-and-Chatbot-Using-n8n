import { loadEnvConfig } from '@next/env';
import { initializeDatabase } from '../lib/server/db';
loadEnvConfig(process.cwd(), true);
void initializeDatabase()
  .then(() => {
    console.log('DentalFlow database indexes initialized.');
    process.exit(0);
  })
  .catch(() => {
    console.error('Database initialization failed. Check MongoDB settings and connectivity.');
    process.exit(1);
  });
