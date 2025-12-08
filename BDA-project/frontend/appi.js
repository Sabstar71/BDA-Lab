const API = (window && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) ? 'http://localhost:8080/api' : '/api';
let map, markerLayer, markers = {}, socket;
let pickerMap = null;
let pickerMarker = null;
let pickerInitialized = false;
let locationsCache = [];
let loadingState = false;
let tableCurrentPage = 1;
let tablePageSize = 50;
let totalRecords = 0;

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function showNotification(message, isError = false) {
  const notif = document.createElement('div');
  notif.style.cssText = `position: fixed; top: 20px; right: 20px; background: ${isError ? '#ef4444' : '#10b981'}; color: white; padding: 12px 20px; border-radius: 8px; z-index: 10000; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.3);`;
  notif.innerText = message;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

function openPickerMap() {
  const modal = document.getElementById('pickerModal');
  if (!modal) return alert('Picker modal not found');
  modal.style.display = 'flex';
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
  let list = [];
  try {
    console.log('Loading locations from:', API + '/locations/all');
    list = await fetch(API + '/locations/all').then(r => r.json());
    console.log('Loaded', list.length, 'locations');
  } catch (e) { 
    console.error('Failed to load locations:', e);
    list = []; 
  }

  const container = document.getElementById('locationsList');
  if (container) container.innerHTML = '';

  if (markerLayer && markerLayer.clearLayers) markerLayer.clearLayers();
  markers = {};

  let prevColor = null;
  const chunks = [];
  for (let i = 0; i < list.length; i += 100) {
    chunks.push(list.slice(i, i + 100));
  }

  let chunkIndex = 0;
  function processChunk() {
    if (chunkIndex >= chunks.length) {
      try {
        const total = list.length;
        const avg = total ? Math.round(list.reduce((s, x) => s + ((x.status ?? x.binLevel) || 0), 0) / total) : 0;
        const full = list.filter(x => ((x.status ?? x.binLevel) || 0) >= 90).length;
        const tb = document.getElementById('totalBins'); if (tb) tb.innerText = total;
        const af = document.getElementById('avgFill'); if (af) af.innerText = avg + '%';
        const fb = document.getElementById('fullBins'); if (fb) fb.innerText = full;
      } catch (e) {}
      setupTablePagination();
      return;
    }
    const chunk = chunks[chunkIndex++];
    chunk.forEach(loc => {
      const color = colorForBin((loc.status ?? loc.binLevel) || 0);
      const m = L.marker([loc.lat, loc.lng], { icon: makeIcon(color) });
      m.bindPopup(`<b>${loc.name}</b><br>Bin ID: ${loc.binId || '—'}<br>Fill: ${(loc.status ?? loc.binLevel) || 0}%<br><button class="popup-edit" data-id="${loc.id}">Edit</button>`);
      m.on('popupopen', () => {
        const btn = document.querySelector('.popup-edit');
        if (btn) btn.onclick = () => openEditModal(loc.id);
      });
      if (markerLayer && markerLayer.addLayer) markerLayer.addLayer(m);
      markers[loc.id] = m;
    });
    requestAnimationFrame(processChunk);
  }
  requestAnimationFrame(processChunk);
}

function setupTablePagination() {
  const container = document.getElementById('tablePaginationContainer');
  if (!container) return;
  container.innerHTML = '';
  
  const tbody = document.querySelector('#binTable tbody');
  if (!tbody) return;

  totalRecords = locationsCache.length;
  const totalPages = Math.ceil(totalRecords / tablePageSize);

  const prevBtn = document.createElement('button');
  prevBtn.className = 'pagination-btn';
  prevBtn.innerText = 'Previous';
  prevBtn.disabled = tableCurrentPage <= 1;
  prevBtn.onclick = () => {
    if (tableCurrentPage > 1) {
      tableCurrentPage--;
      loadAllLocations();
      window.scrollTo(0, 0);
    }
  };
  container.appendChild(prevBtn);

  for (let i = 1; i <= Math.min(totalPages, 10); i++) {
    const btn = document.createElement('button');
    btn.className = 'pagination-btn' + (i === tableCurrentPage ? ' active' : '');
    btn.innerText = i;
    btn.onclick = () => {
      tableCurrentPage = i;
      loadAllLocations();
      window.scrollTo(0, 0);
    };
    container.appendChild(btn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.className = 'pagination-btn';
  nextBtn.innerText = 'Next';
  nextBtn.disabled = tableCurrentPage >= totalPages;
  nextBtn.onclick = () => {
    if (tableCurrentPage < totalPages) {
      tableCurrentPage++;
      loadAllLocations();
      window.scrollTo(0, 0);
    }
  };
  container.appendChild(nextBtn);

  const pageInfo = document.createElement('span');
  pageInfo.className = 'page-info';
  pageInfo.innerText = `Page ${tableCurrentPage} of ${totalPages} (${totalRecords} total)`;
  container.appendChild(pageInfo);
}

async function loadAllLocations() {
  try {
    const offset = (tableCurrentPage - 1) * tablePageSize;
    const list = locationsCache && locationsCache.length > 0 ? locationsCache : await fetch(API + '/locations/all').then(r => r.json());
    if (!locationsCache || locationsCache.length === 0) {
      locationsCache = list;
    }
    
    const pageItems = list.slice(offset, offset + tablePageSize);
    
    const tbody = document.querySelector('#binTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    console.log('Loading page', tableCurrentPage, 'with', pageItems.length, 'items out of', list.length, 'total');
    
    pageItems.forEach((loc, index) => {
      const fill = (loc.status ?? loc.binLevel) || 0;
      const tr = document.createElement('tr');
      tr.style.animationDelay = `${index * 30}ms`;
      tr.className = 'table-row-animate';
      
      const statusBadge = fill >= 90 ? 'status-full' : fill >= 40 ? 'status-partial' : 'status-empty';
      const statusText = fill >= 90 ? 'FULL' : fill >= 40 ? 'MEDIUM' : 'EMPTY';
      
      tr.innerHTML = `<td>${loc.binId || '—'}</td><td>${loc.name}</td><td><strong>${fill}%</strong></td><td><span class="status-badge ${statusBadge}">${statusText}</span></td><td>${loc.createdAt ? new Date(loc.createdAt).toLocaleString() : '—'}</td>
        <td><button class="t-edit action-btn" data-id="${loc.id}">Edit</button> <button class="t-del action-btn" data-id="${loc.id}">Delete</button></td>`;
      tr.addEventListener('click', (e) => {
        if (e.target.className.includes('action-btn')) return;
        if (markers[loc.id]) {
          map.setView([loc.lat, loc.lng], 16, { animate: true });
          markers[loc.id].openPopup();
        }
      });
      tbody.appendChild(tr);
    });
    
    Array.from(document.querySelectorAll('.t-del')).forEach(b => b.onclick = async (e) => {
      e.stopPropagation();
      await fetch(API + '/locations/' + b.dataset.id, { method: 'DELETE' });
      await loadLocations();
      loadAllLocations();
    });
    Array.from(document.querySelectorAll('.t-edit')).forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      openEditModal(b.dataset.id);
    });
  } catch (e) {
    console.error('Error loading table:', e);
  }
}

function initMap() {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) {
    console.error('Map container not found!');
    return;
  }
  map = L.map('map').setView([24.8607, 67.0011], 12);
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

    socket = io('http://localhost:8080');
    socket.on('locations:update', msg => {
      console.log('socket update', msg && msg.action);
      loadLocations();
      loadAllLocations();
    });
  } catch (e) { console.warn('socket init failed', e); }
}

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
  console.log('Opening add modal');
  createModal();
  showModal({ mode: 'create', id: null });
}

function openEditModal(id) {
  console.log('Opening edit modal for id:', id);
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
    
    try {
      if (opts.mode === 'create') {
        if (!picked) return alert('Choose a location on the map');
        const res = await fetch(API + '/locations', { 
          method: 'POST', 
          headers: {'Content-Type':'application/json'}, 
          body: JSON.stringify({ name, lat: picked.lat, lng: picked.lng, binLevel, binId, status: binLevel }) 
        });
        if (!res.ok) throw new Error('Failed to create location');
        showNotification('Bin created successfully');
      } else {
        const res = await fetch(API + '/locations/' + opts.id, { 
          method: 'PUT', 
          headers: {'Content-Type':'application/json'}, 
          body: JSON.stringify({ name, binId, binLevel, status: binLevel, lat: picked ? picked.lat : undefined, lng: picked ? picked.lng : undefined }) 
        });
        if (!res.ok) throw new Error('Failed to update location');
        showNotification('Bin updated successfully');
      }
      document.getElementById('modalRoot').innerHTML = '';
      await loadLocations();
      await loadAllLocations();
      setupTablePagination();
    } catch (err) {
      console.error('Save error:', err);
      showNotification('Error: ' + err.message, true);
    }
  };
}

// Button handler functions
function refreshData() {
  console.log('Refreshing data...');
  fetch(API + '/locations/all').then(r => r.json()).then(list => {
    locationsCache = list;
    loadLocations();
    loadAllLocations();
    showNotification('Data refreshed successfully');
  }).catch(err => {
    console.error('Refresh failed:', err);
    showNotification('Failed to refresh data', true);
  });
}

function exportData() {
  console.log('Exporting data...');
  fetch(API + '/locations/all').then(r => r.json()).then(list => {
    const json = JSON.stringify(list, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'waste-bins-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Data exported successfully');
  }).catch(err => {
    console.error('Export failed:', err);
    showNotification('Failed to export data', true);
  });
}

function deleteAllBins() {
  if (!confirm('Are you sure you want to delete ALL waste bins? This cannot be undone!')) return;
  
  console.log('Deleting all bins...');
  fetch(API + '/locations/deleteAll', { method: 'DELETE' }).then(r => r.json()).then(result => {
    console.log('Delete result:', result);
    locationsCache = [];
    loadLocations();
    loadAllLocations();
    showNotification('All bins deleted successfully');
  }).catch(err => {
    console.error('Delete all failed:', err);
    showNotification('Failed to delete all bins', true);
  });
}

function toggleDataTable() {
  console.log('Toggle table button clicked');
  const container = document.getElementById('dataTableContainer');
  const btn = document.querySelector('.toggle-table-btn');
  
  if (!container || !btn) {
    console.error('Table container or button not found');
    return;
  }
  
  const icon = btn.querySelector('.toggle-icon');
  const text = btn.querySelector('.toggle-text');
  
  if (container.style.display === 'none' || !container.style.display) {
    console.log('Opening table...');
    container.style.display = 'block';
    if (icon) icon.textContent = '▲';
    if (text) text.textContent = 'Hide Table';
    tableCurrentPage = 1;
    loadAllLocations();
    setupTablePagination();
  } else {
    console.log('Closing table...');
    container.style.display = 'none';
    if (icon) icon.textContent = '▼';
    if (text) text.textContent = 'Show Table';
  }
}

let currentFilter = 'all';

function filterAndRefresh() {
  console.log('Search refresh triggered');
  const query = document.getElementById('searchInput').value.toLowerCase();
  applyFiltersAndSearch(query, currentFilter);
}

function filterByStatus(status, button) {
  console.log('Filtering by status:', status);
  currentFilter = status;
  
  // Highlight active button
  document.querySelectorAll('.filter-buttons button, .row button').forEach(b => b.style.opacity = '0.6');
  if (button) button.style.opacity = '1';
  
  const query = document.getElementById('searchInput').value.toLowerCase();
  applyFiltersAndSearch(query, status);
}

function applyFiltersAndSearch(query, status) {
  let filtered = locationsCache || [];
  
  if (query) {
    filtered = filtered.filter(loc => 
      (loc.name || '').toLowerCase().includes(query) || 
      (loc.binId || '').toLowerCase().includes(query)
    );
  }
  
  if (status !== 'all') {
    filtered = filtered.filter(loc => {
      const fill = (loc.status ?? loc.binLevel) || 0;
      if (status === 'full') return fill >= 90;
      if (status === 'medium') return fill >= 40 && fill < 90;
      if (status === 'empty') return fill < 40;
      return true;
    });
  }
  
  console.log('Filtered result:', filtered.length, 'items');
  renderFilteredMap(filtered);
}

function renderFilteredMap(filtered) {
  if (markerLayer && markerLayer.clearLayers) markerLayer.clearLayers();
  markers = {};

  const chunks = [];
  for (let i = 0; i < filtered.length; i += 100) {
    chunks.push(filtered.slice(i, i + 100));
  }

  let chunkIndex = 0;
  function processChunk() {
    if (chunkIndex >= chunks.length) return;
    const chunk = chunks[chunkIndex++];
    chunk.forEach(loc => {
      const color = colorForBin((loc.status ?? loc.binLevel) || 0);
      const m = L.marker([loc.lat, loc.lng], { icon: makeIcon(color) });
      m.bindPopup(`<b>${loc.name}</b><br>Bin ID: ${loc.binId || '—'}<br>Fill: ${(loc.status ?? loc.binLevel) || 0}%<br><button class="popup-edit" data-id="${loc.id}">Edit</button>`);
      m.on('popupopen', () => {
        const btn = document.querySelector('.popup-edit');
        if (btn) btn.onclick = () => openEditModal(loc.id);
      });
      if (markerLayer && markerLayer.addLayer) markerLayer.addLayer(m);
      markers[loc.id] = m;
    });
    requestAnimationFrame(processChunk);
  }
  requestAnimationFrame(processChunk);
}

window.addEventListener('load', () => {
  console.log('DOM loaded, initializing app...');
  initMap();
  initSocket();
  console.log('Fetching initial data from:', API + '/locations/all');
  fetch(API + '/locations/all').then(r => {
    console.log('API response status:', r.status);
    return r.json();
  }).then(list => {
    console.log('API returned', list.length, 'records');
    console.log('First record:', list[0]);
    locationsCache = list;
    loadLocations();
    loadAllLocations();
    setupTablePagination();
  }).catch((err) => {
    console.error('Failed to fetch initial data:', err);
    alert('Error loading data: ' + err.message);
    locationsCache = [];
    loadLocations();
    loadAllLocations();
    setupTablePagination();
  });

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
    fetch(API + '/locations/all').then(r => r.json()).then(list => {
      locationsCache = list;
      loadLocations();
      loadAllLocations();
    });
  };

  const healthEl = document.getElementById('apiHealth');
  if (healthEl) fetch('/api/health').then(r => r.json()).then(j => { healthEl.innerText = j.status; healthEl.href = '/api/health'; }).catch(()=>{});
});

