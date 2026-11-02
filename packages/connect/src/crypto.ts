import * as ed from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

ed.hashes.sha512 = (m: Uint8Array) => sha512(m);

export const sha256Hex = (bytes: Uint8Array): string => bytesToHex(sha256(bytes));

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s.trim().replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** True only for a valid Ed25519 signature by `publicKey` over exactly `message`. Never throws. */
export function verifySignature(sigBase64: string, message: Uint8Array, publicKeyBase64: string): boolean {
  try {
    const sig = fromBase64(sigBase64);
    const pub = fromBase64(publicKeyBase64);
    if (sig.length !== 64 || pub.length !== 32) return false;
    return ed.verify(sig, message, pub);
  } catch {
    return false;
  }
}

/** For tests and tooling: a new keypair, both base64 (32 bytes each). */
export function generateKeypair(): { secretKey: string; publicKey: string } {
  const k = ed.keygen();
  return { secretKey: toBase64(k.secretKey), publicKey: toBase64(k.publicKey) };
}

export function signBytes(message: Uint8Array, secretKeyBase64: string): string {
  return toBase64(ed.sign(message, fromBase64(secretKeyBase64)));
}
