import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const secret = process.env.JWT_SECRET;

if (!secret) {
  console.error('JWT_SECRET not found in .env');
  process.exit(1);
}

const payload = {
  iss: 'omnilert-api'
};

const token = jwt.sign(payload, secret, {
  algorithm: 'HS256',
  expiresIn: '1h'
});

console.log('\n--- Bearer Token for Webhook Testing ---');
console.log(`Bearer ${token}`);
console.log('-------------------------------------------\n');
