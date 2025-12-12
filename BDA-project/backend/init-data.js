const crypto = require('crypto');
const HdfsClient = require('./hdfsClient');
const fs = require('fs').promises;
const path = require('path');

const HDFS_HOST = process.env.HDFS_HOST || 'http://hadoop:50070';
const HDFS_USER = process.env.HDFS_USER || 'root';
const LOCATIONS_PATH = '/locations/locations.json';
const LOCAL_DATA_DIR = path.join(__dirname, 'data');
const LOCAL_DATA_FILE = path.join(LOCAL_DATA_DIR, 'locations.json');

async function waitForHdfs(maxRetries = 30) {
  console.log('[Init] Waiting for HDFS to be ready...');
  const axios = require('axios');
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Simple HTTP check to see if HDFS NameNode is responding
      const response = await axios.get(`${HDFS_HOST}/webhdfs/v1/?op=GETFILESTATUS`, {
        timeout: 2000,
        validateStatus: s => s >= 200 && s < 500
      });
      if (response.status < 500) {
        console.log('[Init] ✓ HDFS is ready!');
        return true;
      }
    } catch (err) {
      // Ignore connection errors
    }
    console.log(`[Init] Attempt ${i + 1}/${maxRetries}: HDFS not ready yet, waiting...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.warn('[Init] ⚠ HDFS did not become ready after', maxRetries, 'seconds - will use local fallback');
  return false;
}

async function generateAndSaveData() {
  const count = 10000;
  
  // Wait for HDFS to be ready
  const hdfsReady = await waitForHdfs();
  if (!hdfsReady) {
    console.log('[Init] HDFS not available - will generate and save to local storage only');
  }
  
  const hdfs = new HdfsClient({ host: HDFS_HOST, user: HDFS_USER });

  // Check if data already exists in HDFS first
  if (hdfsReady) {
    try {
      console.log('[Init] Checking if data already exists in HDFS...');
      const existing = await hdfs.readFile(LOCATIONS_PATH);
      if (existing) {
        const data = JSON.parse(existing);
        if (Array.isArray(data) && data.length > 0) {
          console.log(`[Init] ✓ Found ${data.length} existing locations in HDFS - skipping generation`);
          return;
        }
      }
    } catch (err) {
      console.log('[Init] No existing data in HDFS or error reading - will generate new data');
    }
  }

  // Check if data exists locally
  try {
    const localData = await fs.readFile(LOCAL_DATA_FILE, 'utf8');
    const data = JSON.parse(localData);
    if (Array.isArray(data) && data.length > 0) {
      console.log(`[Init] ✓ Found ${data.length} existing locations locally`);
      // If HDFS is ready, also save to HDFS
      if (hdfsReady) {
        try {
          await hdfs.ensureDir('/locations');
          await hdfs.writeFile(LOCATIONS_PATH, localData);
          console.log('[Init] ✓ Synced local data to HDFS');
        } catch (e) {
          console.warn('[Init] ⚠ Could not sync to HDFS:', e && e.message);
        }
      }
      return;
    }
  } catch (err) {
    console.log('[Init] No local data found - will generate new data');
  }

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

  console.log(`\nSaving ${count} records to local file first...`);
  try {
    await fs.mkdir(LOCAL_DATA_DIR, { recursive: true });
    await fs.writeFile(LOCAL_DATA_FILE, JSON.stringify(arr), 'utf8');
    console.log(`✓ Saved ${count} records to local file`);
  } catch (e) {
    console.error('✗ Failed to save local file:', e.message);
    return false;
  }

  // Now try to save to HDFS (optional)
  console.log(`\nAttempting to save to HDFS at ${LOCATIONS_PATH}...`);
  try {
    const hdfs = new HdfsClient({ host: HDFS_HOST, user: HDFS_USER });
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
      process.exit(success ? 0 : 0); // Exit with 0 even on HDFS failure - use local fallback
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(0); // Exit gracefully even with errors - backend will use local data
    });
}

module.exports = generateAndSaveData;
