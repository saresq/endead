// scripts/dice-stats.ts
//
// Rolls 1M d6 under a fixed seed and reports distribution + chi-square.
// Keeps the statistical floor auditable:
//   npx tsx scripts/dice-stats.ts
//   npx tsx scripts/dice-stats.ts my-custom-seed 5000000

import { Rng } from '../src/services/Rng';

const seed = process.argv[2] ?? 'dice-stats-default';
const n = Number(process.argv[3] ?? 1_000_000);

const rng = Rng.fromString(seed);
const counts = [0, 0, 0, 0, 0, 0];
for (let i = 0; i < n; i++) counts[rng.d6() - 1]++;

const expected = n / 6;
const chi2 = counts.reduce((acc, o) => acc + ((o - expected) ** 2) / expected, 0);

console.log(`Seed:           "${seed}"`);
console.log(`Rolls:          ${n.toLocaleString()}`);
console.log(`Expected/face:  ${expected.toLocaleString()}`);
console.log('Observed:');
for (let f = 0; f < 6; f++) {
  const dev = counts[f] - expected;
  const pct = (dev / expected) * 100;
  console.log(`  ${f + 1}: ${counts[f].toString().padStart(9)}  (${(pct >= 0 ? '+' : '') + pct.toFixed(3)}%)`);
}
console.log(`Chi-square (5 df): ${chi2.toFixed(4)}`);
console.log('  Critical values:  p=0.99 → 0.554,  p=0.50 → 4.351,  p=0.01 → 15.086');
if (chi2 > 15.086) {
  console.log('FAIL: distribution is suspiciously non-uniform (p < 0.01).');
  process.exit(1);
}
