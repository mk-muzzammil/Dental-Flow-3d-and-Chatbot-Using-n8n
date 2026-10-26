import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
let password = '';
if (process.stdin.isTTY) {
  process.stderr.write('Admin password (hidden): ');
  const hidden = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const reader = createInterface({ input: process.stdin, output: hidden, terminal: true });
  password = await reader.question('');
  reader.close();
  process.stderr.write('\n');
} else {
  for await (const chunk of process.stdin) {
    password += chunk;
    if (password.length > 1025) throw new Error('Password is too long.');
  }
  password = password.replace(/\r?\n$/, '');
}
if (password.length < 12 || password.length > 1024) throw new Error('Use a password of 12–1024 characters.');
const salt = randomBytes(16).toString('hex');
process.stdout.write(`scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}\n`);
