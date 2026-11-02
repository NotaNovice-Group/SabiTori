#!/usr/bin/env node
// Prints a new Ed25519 keypair (base64, 32 bytes each). Nothing is written to disk.
//   SECRET -> keep it private (password manager / CI secret) as UPDATE_SIGNING_KEY. Never commit it.
//   PUBLIC -> goes into apps/app/.env as VITE_UPDATE_PUBLIC_KEY (it is built into the app).
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const seed = Buffer.from(privateKey.export({ format: 'jwk' }).d, 'base64url');
const pub = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
console.log(`UPDATE_SIGNING_KEY (secret, keep private): ${seed.toString('base64')}`);
console.log(`VITE_UPDATE_PUBLIC_KEY (public):           ${pub.toString('base64')}`);
console.error('\nThe secret key was NOT saved anywhere. Store it now; if you lose it you cannot publish updates for the apps already installed.');
