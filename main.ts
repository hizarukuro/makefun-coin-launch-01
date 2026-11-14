// Entry program for make.fun bounty "Race to launch a real coin on Solana"
// (slug: makefun-coin-launch-01). Node 22, standard library only, no network.
//
// What this program does — and all it has to do:
//   The coin itself is created on pump.fun by the agent before submission.
//   This program hands the launch record to the grader: it reads LAUNCH.json
//   at the repository root, checks that it is well formed, and copies it
//   byte for byte to LAUNCH.json in the output directory.
//
// How the grader runs it (and how to run it the same way locally):
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader's container the defaults /bot and /output apply.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const botDir = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps for the launch file.
const MAX_LAUNCH_BYTES = 16384;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_CHARS = /^[1-9A-HJ-NP-Za-km-z]+$/;

function fail(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

// --- read the launch file exactly as it stands ------------------------------
const launchPath = join(botDir, 'LAUNCH.json');
let raw: string;
try {
  raw = readFileSync(launchPath, 'utf8');
} catch (err) {
  fail(`cannot read ${launchPath}: ${(err as Error).message}`);
}

if (Buffer.byteLength(raw, 'utf8') > MAX_LAUNCH_BYTES) {
  fail(`LAUNCH.json is ${Buffer.byteLength(raw, 'utf8')} bytes; the limit is ${MAX_LAUNCH_BYTES}`);
}

let launch: unknown;
try {
  launch = JSON.parse(raw);
} catch (err) {
  fail(`LAUNCH.json is not valid JSON: ${(err as Error).message}`);
}

if (typeof launch !== 'object' || launch === null || Array.isArray(launch)) {
  fail('LAUNCH.json must be a JSON object with "mint" and "create_signature"');
}

const { mint, create_signature: createSignature } = launch as {
  mint?: unknown;
  create_signature?: unknown;
};

// Decode base58 to bytes. Character counts alone are not proof of shape:
// a 44-character string can decode to 33 bytes, and only the decoded length
// says whether the value can be the key or signature it claims to be.
function base58Decode(text: string): Buffer {
  let value = 0n;
  for (const ch of text) {
    const digit = BASE58_ALPHABET.indexOf(ch);
    if (digit < 0) fail(`character ${JSON.stringify(ch)} is not base58`);
    value = value * 58n + BigInt(digit);
  }
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const body = value === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex');
  let leadingOnes = 0;
  while (leadingOnes < text.length && text[leadingOnes] === '1') leadingOnes += 1;
  return Buffer.concat([Buffer.alloc(leadingOnes), body]);
}

// --- shape checks: the same shapes the gate asks for -------------------------
if (typeof mint !== 'string' || !BASE58_CHARS.test(mint) || mint.length < 32 || mint.length > 44) {
  fail(`"mint" must be a base58 Solana address of 32 to 44 characters; got ${JSON.stringify(mint)}`);
}
if (base58Decode(mint).length !== 32) {
  fail(`"mint" must decode to exactly 32 bytes; got ${base58Decode(mint).length}`);
}
if (
  typeof createSignature !== 'string' ||
  !BASE58_CHARS.test(createSignature) ||
  createSignature.length < 64 ||
  createSignature.length > 88
) {
  fail(
    `"create_signature" must be a base58 transaction signature of 64 to 88 characters; got ${JSON.stringify(createSignature)}`,
  );
}
if (base58Decode(createSignature).length !== 64) {
  fail(`"create_signature" must decode to exactly 64 bytes; got ${base58Decode(createSignature).length}`);
}

// --- hand it over -------------------------------------------------------------
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'LAUNCH.json'), raw);
console.log(`LAUNCH.json handed to ${outputDir} (mint ${mint})`);
