const crypto = require('crypto');
const HdfsClient = require('./hdfsClient');
const fs = require('fs').promises;
const path = require('path');

const HDFS_HOST = process.env.HDFS_HOST || 'http://hadoop:50070';
const HDFS_USER = process.env.HDFS_USER || 'hduser';
const LOCATIONS_PATH = '/locations/locations.json';

async function generateAndSaveData() {
  const count = 10000;
  const hdfs = new HdfsClient({ host: HDFS_HOST, user: HDFS_USER });

  // Pakistan bounding box
  const LAT_MIN = 23.5;
  const LAT_MAX = 37.1;
  const LNG_MIN = 60.9;
  const LNG_MAX = 77.8;

  const arr = [];
  function randBetween(a, b) { return a + Math.random() * (b - a); }

  console.log(`Generating ${count} waste bin locations in Pakistan...`);
  for (let i = 0; i < count; i++) {
    const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const lat = parseFloat(randBetween(LAT_MIN, LAT_MAX).toFixed(6));
    const lng = parseFloat(randBetween(LNG_MIN, LNG_MAX).toFixed(6));
    const status = Math.floor(Math.random() * 101);
    arr.push({
      id,
      binId: `PK-${('00000' + (i + 1)).slice(-5)}`,
      name: `Bin ${i + 1}`,
      lat,
      lng,
      status,
      createdAt: new Date().toISOString()
    });

    if ((i + 1) % 1000 === 0) {
      console.log(`Generated ${i + 1} records...`);
    }
  }

  console.log(`\nSaving ${count} records to local file...`);
  const LOCAL_DATA_DIR = path.join(__dirname, 'data');
  const LOCAL_DATA_FILE = path.join(LOCAL_DATA_DIR, 'locations.json');
  try {
    await fs.mkdir(LOCAL_DATA_DIR, { recursive: true });
    await fs.writeFile(LOCAL_DATA_FILE, JSON.stringify(arr), 'utf8');
    console.log(`✓ Saved ${count} records to local file`);
  } catch (e) {
    console.error('✗ Failed to save local file:', e.message);
    return false;
  }

  // Now try to save to HDFS as well (optional)
  console.log(`\nAttempting to save to HDFS at ${LOCATIONS_PATH}...`);
  try {
    await hdfs.writeFile(LOCATIONS_PATH, JSON.stringify(arr));
    console.log(`✓ Also successfully saved ${count} records to HDFS!`);
    return true;
  } catch (err) {
    console.error('⚠ Could not save to HDFS (optional):', err.message);
    console.log('✓ Data is safely stored locally and will be used by the application');
    return true;
  }
}

// Run if called directly
if (require.main === module) {
  generateAndSaveData()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = generateAndSaveData;
