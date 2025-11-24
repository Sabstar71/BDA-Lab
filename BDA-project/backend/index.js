const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const HdfsClient = require('./hdfsClient');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const HDFS_HOST = process.env.HDFS_HOST || 'http://hadoop:50070';
const HDFS_USER = process.env.HDFS_USER || 'hduser';
const LOCATIONS_PATH = '/locations/locations.json';

const hdfs = new HdfsClient({ host: HDFS_HOST, user: HDFS_USER });
const LOCAL_DATA_DIR = path.join(__dirname, 'data');
const LOCAL_DATA_FILE = path.join(LOCAL_DATA_DIR, 'locations.json');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

async function readLocations() {
  try {
    const text = await hdfs.readFile(LOCATIONS_PATH);
    if (text) return JSON.parse(text);
  } catch (err) {
    console.warn('HDFS read failed, falling back to local file:', err && err.message);
  }
  try {
    const t = await fs.readFile(LOCAL_DATA_FILE, 'utf8');
    return JSON.parse(t || '[]');
  } catch (e) {
    return [];
  }
}

async function writeLocations(arr) {
  const data = JSON.stringify(arr);
  try {
    await hdfs.writeFile(LOCATIONS_PATH, data);
    return;
  } catch (err) {
    console.warn('HDFS write failed, writing to local file instead:', err && err.message);
  }
  try {
    await fs.mkdir(LOCAL_DATA_DIR, { recursive: true });
    await fs.writeFile(LOCAL_DATA_FILE, data, 'utf8');
  } catch (e) {
    console.error('Failed to write local fallback file:', e && e.message);
    throw e;
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/locations', async (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const minBin = parseInt(req.query.minBin || req.query.minStatus || '0', 10) || 0;
  const list = await readLocations();
  const filtered = list.filter(l => (l.name || '').toLowerCase().includes(q) && ((l.status ?? l.binLevel) || 0) >= minBin);
  res.json(filtered);
});

app.get('/api/locations/all', async (req, res) => {
  const list = await readLocations();
  res.json(list);
});

app.post('/api/locations', async (req, res) => {
  const { name, lat, lng, binLevel, binId, status } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'lat/lng required' });
  const list = await readLocations();
  const item = {
    id: uuidv4(),
    binId: binId || null,
    name: name || 'Unnamed',
    lat,
    lng,
    status: (typeof status === 'number' ? status : (binLevel || 0)),
    createdAt: new Date().toISOString()
  };
  list.push(item);
  await writeLocations(list);
  io.emit('locations:update', { action: 'create', item });
  res.status(201).json(item);
});

app.get('/api/locations/:id', async (req, res) => {
  const id = req.params.id;
  const list = await readLocations();
  const item = list.find(x => x.id === id);
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

// export all locations as JSON file
app.get('/api/locations/export', async (req, res) => {
  const list = await readLocations();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="locations.json"');
  res.send(JSON.stringify(list, null, 2));
});

// import locations: replaces/merges existing list
app.post('/api/locations/import', async (req, res) => {
  const payload = req.body;
  if (!Array.isArray(payload)) return res.status(400).json({ error: 'expected array' });
  // ensure items have ids and map status/binLevel
  const list = payload.map(p => ({ id: p.id || uuidv4(), binId: p.binId || p.binId === 0 ? p.binId : null, name: p.name || 'Unnamed', lat: p.lat, lng: p.lng, status: (p.status ?? p.binLevel) || 0, createdAt: p.createdAt || new Date().toISOString() }));
  await writeLocations(list);
  io.emit('locations:update', { action: 'import' });
  res.json({ ok: true, count: list.length });
});

app.put('/api/locations/:id', async (req, res) => {
  const id = req.params.id;
  const { name, lat, lng, binLevel, binId, status } = req.body;
  const list = await readLocations();
  const idx = list.findIndex(x => x.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  if (name !== undefined) list[idx].name = name;
  if (lat !== undefined) list[idx].lat = lat;
  if (lng !== undefined) list[idx].lng = lng;
  if (binId !== undefined) list[idx].binId = binId;
  if (status !== undefined) list[idx].status = status;
  if (binLevel !== undefined && list[idx].status === undefined) list[idx].status = binLevel;
  list[idx].updatedAt = new Date().toISOString();
  await writeLocations(list);
  io.emit('locations:update', { action: 'update', item: list[idx] });
  res.json(list[idx]);
});

app.delete('/api/locations/:id', async (req, res) => {
  const id = req.params.id;
  const list = await readLocations();
  const idx = list.findIndex(x => x.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const [removed] = list.splice(idx, 1);
  await writeLocations(list);
  io.emit('locations:update', { action: 'delete', item: removed });
  res.json({ ok: true });
});

io.on('connection', socket => {
  console.log('ws connected');
  socket.on('ping', () => socket.emit('pong'));
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
