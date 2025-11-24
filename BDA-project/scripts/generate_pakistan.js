const fs = require('fs');
const crypto = require('crypto');
const count = parseInt(process.argv[2] || '10000', 10);
const outDir = '/app/data';
const outFile = outDir + '/locations.json';
const arr = [];

function randBetween(a, b) { return a + Math.random() * (b - a); }

// Pakistan bounding box (approx)
const LAT_MIN = 23.5;
const LAT_MAX = 37.1;
const LNG_MIN = 60.9;
const LNG_MAX = 77.8;

for (let i = 0; i < count; i++) {
  const id = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
  const lat = parseFloat(randBetween(LAT_MIN, LAT_MAX).toFixed(6));
  const lng = parseFloat(randBetween(LNG_MIN, LNG_MAX).toFixed(6));
  const status = Math.floor(Math.random() * 101);
  arr.push({
    id,
    binId: `PK-${('00000' + (i+1)).slice(-5)}`,
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
  console.log(`Wrote ${count} Pakistan-only items to ${outFile}`);
} catch (err) {
  console.error('Failed to write file:', err);
  process.exit(2);
}
