import crypto from 'node:crypto';
import { validatePasswordPolicy } from '../../src/utils/security.js';

// Tanpa karakter yang mudah tertukar (0/O, 1/l/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Password acak kuat, mis. "Xk4p-9QmT-2vRw-Lb7n" (± 95 bit entropi). */
export function generatePassword() {
  for (;;) {
    const groups = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join(''),
    );
    const password = groups.join('-');
    if (validatePasswordPolicy(password).length === 0) return password;
  }
}

/**
 * Memproses satu potongan input keyboard (mode raw) untuk prompt password. Setiap karakter
 * tampil sebagai "*" (atau apa adanya bila `mask: false`); tombol kontrol & urutan escape
 * (panah, Ctrl+V di sebagian terminal) diabaikan agar tidak diam-diam masuk ke password.
 * @returns {{ value: string, echo: string, done?: 'enter' | 'cancel' }}
 */
export function applyPasswordKeys(value, chunk, { mask = true } = {}) {
  let echo = '';
  if (chunk.startsWith('\u001b')) return { value, echo };
  for (const char of chunk) {
    if (char === '\r' || char === '\n' || char === '\u0004') return { value, echo, done: 'enter' };
    if (char === '\u0003') return { value, echo, done: 'cancel' };
    if (char === '\u007f' || char === '\b') {
      if (value.length > 0) {
        value = value.slice(0, -1);
        echo += '\b \b';
      }
    } else if (char >= ' ') {
      value += char;
      echo += mask ? '*' : char;
    }
  }
  return { value, echo };
}

/** Membaca password dari terminal; karakter tampil sebagai "*", atau terlihat bila `mask: false`. */
export function promptPassword(question, { mask = true } = {}) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      reject(new Error('Terminal tidak interaktif. Isi variabel ADMIN_PASSWORD atau jalankan di terminal biasa.'));
      return;
    }
    stdout.write(question);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const finish = (error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      const result = applyPasswordKeys(value, chunk, { mask });
      value = result.value;
      if (result.echo) stdout.write(result.echo);
      if (result.done === 'enter') finish();
      else if (result.done === 'cancel') finish(new Error('Dibatalkan.'));
    };
    stdin.on('data', onData);
  });
}
