/* Frontend app script - enhanced UI and features */
// Use backend API on localhost (frontend is served on :3000, backend on :8080)
const API = (window && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) ? 'http://localhost:8080/api' : '/api';
let map, markerLayer, markers = {}, socket;
// Picker modal map state
let pickerMap = null;
let pickerMarker = null;
let pickerInitialized = false;

function openPickerMap() {
  const modal = document.getElementById('pickerModal');
  if (!modal) return alert('Picker modal not found');
  modal.style.display = 'flex';
  // initialize picker map once
  if (!pickerInitialized) {
    pickerMap = L.map('pickerMap', { attributionControl: false }).setView([24.8607, 67.0011], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pickerMap);
    pickerMap.on('click', e => {
      const lat = e.latlng.lat.toFixed(6);
      const lng = e.latlng.lng.toFixed(6);
      document.getElementById('lat').value = lat;
      document.getElementById('lon').value = lng;
      if (!pickerMarker) pickerMarker = L.marker(e.latlng).addTo(pickerMap);
      else pickerMarker.setLatLng(e.latlng);
    });
    pickerInitialized = true;
  }
  setTimeout(() => { try { pickerMap.invalidateSize(); } catch(e){} }, 200);
}

function closePicker() {
  const modal = document.getElementById('pickerModal');
  if (!modal) return;
  modal.style.display = 'none';
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error('API error ' + res.status);
  return res.json();
}

function colorForBin(level) {
  if (level >= 75) return 'red';
  if (level >= 40) return 'orange';
  return 'green';
}

function makeIcon(colorName) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<span class="dot ${colorName}"></span>`,
    iconSize: [18, 18]
  });
}

async function loadLocations() {
  // load all locations and render list + markers
  let list = [];
  try {
    list = await fetch(API + '/locations/all').then(r => r.json());
  } catch (e) { list = []; }

  const container = document.getElementById('locationsList');
  if (container) container.innerHTML = '';

  // clear markers
  if (markerLayer && markerLayer.clearLayers) markerLayer.clearLayers();
  markers = {};

  list.forEach(loc => {
    const el = document.createElement('div');
    el.className = 'loc-item';
    const fill = (loc.status ?? loc.binLevel) || 0;
    el.innerHTML = `<div class="meta"><strong>${loc.name}</strong><small>${new Date(loc.createdAt).toLocaleString()}</small></div>
      <div class="coords">${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}</div>
      <div class="coords">Bin ID: <strong>${loc.binId || '—'}</strong></div>
      <div class="controls-row">Fill: <b>${fill}%</b>
      <button data-id="${loc.id}" class="edit">Edit</button>
      <button data-id="${loc.id}" class="del">Delete</button></div>`;
    if (container) container.appendChild(el);

    const color = colorForBin(fill);
    const m = L.marker([loc.lat, loc.lng], { icon: makeIcon(color) });
    m.bindPopup(`<b>${loc.name}</b><br>Bin ID: ${loc.binId || '—'}<br>Fill: ${fill}%<br><button class="popup-edit" data-id="${loc.id}">Edit</button>`);
    m.on('popupopen', () => {
      const btn = document.querySelector('.popup-edit');
      if (btn) btn.onclick = () => openEditModal(loc.id);
    });
    if (markerLayer && markerLayer.addLayer) markerLayer.addLayer(m);
    markers[loc.id] = m;
  });

  // update summary stats if present
  try {
    const total = list.length;
    const avg = total ? Math.round(list.reduce((s, x) => s + ((x.status ?? x.binLevel) || 0), 0) / total) : 0;
    const full = list.filter(x => ((x.status ?? x.binLevel) || 0) >= 90).length;
    const tb = document.getElementById('totalBins'); if (tb) tb.innerText = total;
    const af = document.getElementById('avgFill'); if (af) af.innerText = avg + '%';
    const fb = document.getElementById('fullBins'); if (fb) fb.innerText = full;
  } catch (e) {}

  // attach delete/edit handlers
  Array.from(document.querySelectorAll('.del')).forEach(btn => btn.onclick = async () => {
    const id = btn.getAttribute('data-id');
    await fetch(API + '/locations/' + id, { method: 'DELETE' });
    loadLocations();
    loadAllLocations();
  });
  Array.from(document.querySelectorAll('.edit')).forEach(btn => btn.onclick = e => openEditModal(btn.getAttribute('data-id')));
}

async function loadAllLocations() {
  const list = await fetch(API + '/locations/all').then(r => r.json()).catch(() => []);
  const tbody = document.querySelector('#binTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  list.forEach(loc => {
    const fill = (loc.status ?? loc.binLevel) || 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${loc.binId || ''}</td><td>${loc.name}</td><td>${fill}%</td><td>${loc.status || ''}</td><td>${loc.createdAt ? new Date(loc.createdAt).toLocaleString() : ''}</td>
      <td><button class="t-edit" data-id="${loc.id}">Edit</button> <button class="t-del" data-id="${loc.id}">Delete</button></td>`;
    // clicking a table row pans the main map to that marker
    tr.addEventListener('click', () => {
      if (markers[loc.id]) {
        map.setView([loc.lat, loc.lng], 16, { animate: true });
        markers[loc.id].openPopup();
      }
    });
    tbody.appendChild(tr);
  });
  Array.from(document.querySelectorAll('.t-del')).forEach(b => b.onclick = async () => { await fetch(API + '/locations/' + b.dataset.id, { method: 'DELETE' }); loadLocations(); loadAllLocations(); });
  Array.from(document.querySelectorAll('.t-edit')).forEach(b => b.onclick = () => openEditModal(b.dataset.id));
}

function initMap() {
  map = L.map('mainMap').setView([24.8607, 67.0011], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  if (typeof L.markerClusterGroup === 'function') markerLayer = L.markerClusterGroup();
  else markerLayer = L.layerGroup();
  map.addLayer(markerLayer);
  // ensure map displays correctly if container size changes
  setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 300);
}

function initSocket() {
  try {
    if (typeof io === 'undefined') return;
    // connect to backend socket server explicitly
    socket = io('http://localhost:8080');
    socket.on('locations:update', msg => {
      console.log('socket update', msg && msg.action);
      loadLocations();
      loadAllLocations();
    });
  } catch (e) { console.warn('socket init failed', e); }
}

// CSV export helper
async function exportCSV() {
  const list = await fetch(API + '/locations/all').then(r => r.json()).catch(() => []);
  if (!list.length) return alert('No data to export');
  const cols = ['id','binId','name','lat','lng','status','createdAt'];
  const rows = [cols.join(',')].concat(list.map(it => cols.map(c => '"' + (it[c] === undefined ? '' : String(it[c]).replace(/"/g,'""')) + '"').join(',')));
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'locations.csv'; a.click();
}

// Heatmap support
let heatLayer = null;
function toggleHeatmap() {
  if (!map) return;
  if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; return; }
  fetch(API + '/locations/all').then(r => r.json()).then(list => {
    const points = list.map(i => [i.lat, i.lng, ((i.status ?? i.binLevel) || 0) / 100]);
    heatLayer = L.heatLayer(points, { radius: 25, blur: 15, maxZoom: 17 }).addTo(map);
  }).catch(()=>{});
}

function openAddModal(prepicked) {
  // reset form fields and focus
  const eid = document.getElementById('editId'); if (eid) eid.value = '';
  const bin = document.getElementById('binId'); if (bin) bin.value = '';
  const name = document.getElementById('location'); if (name) name.value = '';
  const f = document.getElementById('fill'); if (f) f.value = '';
  const st = document.getElementById('status'); if (st) st.value = '';
  const last = document.getElementById('last'); if (last) last.value = '';
  const lat = document.getElementById('lat'); if (lat) lat.value = '';
  const lon = document.getElementById('lon'); if (lon) lon.value = '';
  if (name) name.focus();
}

function openEditModal(id) {
  createModal();
  showModal({ mode: 'edit', id });
}

function createModal() {
  if (document.getElementById('modalRoot')) return;
  const root = document.createElement('div');
  root.id = 'modalRoot';
  document.body.appendChild(root);
}

function showModal(opts) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal">
      <div class="modal-body">
        <h3>${opts.mode === 'edit' ? 'Edit Location' : 'Add Location'}</h3>
        <label>Bin ID <input id="m_binid" placeholder="optional" /></label>
        <label>Name <input id="m_name" /></label>
        <label>Fill (%) <input id="m_bin" type="number" min="0" max="100" /></label>
        <div id="m_mini" class="mini-map"></div>
        <div class="modal-actions">
          <button id="m_save" class="primary">Save</button>
          <button id="m_cancel">Cancel</button>
        </div>
      </div>
    </div>`;

  const cancel = document.getElementById('m_cancel');
  cancel.onclick = () => root.innerHTML = '';

  const mini = L.map('m_mini', { attributionControl: false }).setView([24.8607, 67.0011], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mini);
  let picked = null; let marker = null;
  mini.on('click', e => { picked = e.latlng; if (!marker) marker = L.marker(picked).addTo(mini); else marker.setLatLng(picked); });

  if (opts.mode === 'edit') {
    fetch(API + '/locations/' + opts.id).then(r => r.json()).then(loc => {
      document.getElementById('m_name').value = loc.name;
      document.getElementById('m_binid').value = loc.binId || '';
      document.getElementById('m_bin').value = (loc.status ?? loc.binLevel) || 0;
      picked = { lat: loc.lat, lng: loc.lng };
      marker = L.marker([loc.lat, loc.lng]).addTo(mini);
    });
  }

  document.getElementById('m_save').onclick = async () => {
    const name = document.getElementById('m_name').value || 'Unnamed';
    const binId = document.getElementById('m_binid').value || null;
    const binLevel = parseInt(document.getElementById('m_bin').value || '0', 10);
    if (opts.mode === 'create') {
      if (!picked) return alert('Choose a location on the map');
      await fetch(API + '/locations', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, lat: picked.lat, lng: picked.lng, binLevel, binId, status: binLevel }) });
    } else {
      await fetch(API + '/locations/' + opts.id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, binId, binLevel, status: binLevel, lat: picked ? picked.lat : undefined, lng: picked ? picked.lng : undefined }) });
    }
    document.getElementById('modalRoot').innerHTML = '';
    loadLocations();
    loadAllLocations();
  };
}

window.addEventListener('load', () => {
  initMap();
  initSocket();
  loadLocations();
  loadAllLocations();

  // form submit handling
  const form = document.getElementById('binForm');
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const id = document.getElementById('editId').value || '';
      const binId = document.getElementById('binId').value || '';
      const name = document.getElementById('location').value || 'Unnamed';
      const fill = parseInt(document.getElementById('fill').value || '0', 10);
      const status = document.getElementById('status').value || String(fill);
      const last = document.getElementById('last').value || '';
      const lat = parseFloat(document.getElementById('lat').value);
      const lon = parseFloat(document.getElementById('lon').value);
      if (isNaN(lat) || isNaN(lon)) {
        alert('Please pick a location on the map first. Click "Pick on Map" and then click the desired point.');
        openPickerMap();
        return;
      }
      const payload = { name, binId, binLevel: fill, status: Number(status), lat, lng: lon };
      try {
        if (!id) {
          await fetch(API + '/locations', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        } else {
          await fetch(API + '/locations/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        }
        loadLocations();
        loadAllLocations();
        form.reset();
      } catch (err) {
        alert('Failed to save: ' + (err.message || err));
      }
    });
  }

  // export/import handlers (if elements exist)
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) exportBtn.onclick = async () => {
    const data = await fetch(API + '/locations/export').then(r => r.blob());
    const url = URL.createObjectURL(data);
    const a = document.createElement('a'); a.href = url; a.download = 'locations.json'; a.click();
  };
  const exportCSVBtn = document.getElementById('exportCSV');
  if (exportCSVBtn) exportCSVBtn.onclick = exportCSV;
  const heatToggle = document.getElementById('heatToggle');
  if (heatToggle) heatToggle.onclick = toggleHeatmap;
  const importFile = document.getElementById('importFile');
  if (importFile) importFile.onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const json = await file.text();
    await fetch(API + '/locations/import', { method: 'POST', headers: {'Content-Type':'application/json'}, body: json });
    loadLocations();
    loadAllLocations();
  };

  // health (if apiHealth exists)
  const healthEl = document.getElementById('apiHealth');
  if (healthEl) fetch('/api/health').then(r => r.json()).then(j => { healthEl.innerText = j.status; healthEl.href = '/api/health'; }).catch(()=>{});
});
