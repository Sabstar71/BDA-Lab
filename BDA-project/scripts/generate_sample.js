const fs = require('fs');
const crypto = require('crypto');
const count = parseInt(process.argv[2] || '10000', 10);
const outDir = '/app/data';
const outFile = outDir + '/locations.json';
const arr = [];

function randBetween(a, b) { return a + Math.random() * (b - a); }

for (let i = 0; i < count; i++) {
  const id = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
  // Random coordinates within Pakistan roughly (lat 23.5-33.5, lon 66.5-75.5)
  const lat = parseFloat(randBetween(23.5, 33.5).toFixed(6));
  const lng = parseFloat(randBetween(66.5, 75.5).toFixed(6));
  const status = Math.floor(Math.random() * 101);
  arr.push({
    id,
    binId: `BIN-${('00000' + (i+1)).slice(-5)}`,
    name: `Bin ${i+1}`,
    lat,
    lng,
    status,
    createdAt: new Date().toISOString()
  });
}

try {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(arr), 'utf8');
  console.log(`Wrote ${count} items to ${outFile}`);
} catch (err) {
  console.error('Failed to write file:', err);
  process.exit(2);
}
