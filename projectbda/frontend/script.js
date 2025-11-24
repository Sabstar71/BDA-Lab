const apiBase = 'http://localhost:8000';

const map = L.map('map', { zoomControl: true }).setView([24.86, 67.0], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

const markers = L.markerClusterGroup();
map.addLayer(markers);

const listEl = document.getElementById('list');
const toast = document.getElementById('toast');
let pickMode = false;
let pickMarker = null;

function showToast(msg){
  toast.textContent = msg; toast.classList.remove('hidden'); requestAnimationFrame(()=>toast.classList.add('show'));
  setTimeout(()=>{ toast.classList.remove('show'); setTimeout(()=>toast.classList.add('hidden'),200); }, 2600);
}

async function loadMarkers(){
  markers.clearLayers(); listEl.innerHTML = '';
  const existingListEl = document.getElementById('existing-list');
  const existingCountEl = document.getElementById('existing-count');
  existingListEl.innerHTML = '';
  try{
    const res = await fetch(`${apiBase}/waste`);
    const items = await res.json();
    if(!Array.isArray(items)) return;
    items.forEach(i => { addMarkerToMap(i); addExistingItem(i); });
    existingCountEl.textContent = items.length;
    showToast(`${items.length} locations loaded`);
  }catch(e){
    console.error(e); showToast('Failed to load locations');
  }
}

function addMarkerToMap(i){
  const icon = L.divIcon({className:'custom-icon', html:`<div class="dot"></div>`, iconSize:[20,20]});
  const popupId = `popup-${i.id}`;
  const m = L.marker([i.latitude, i.longitude], {icon}).bindPopup(`<div class="popup-content"><b>${i.name || 'No name'}</b><div>${i.description || ''}</div><div id="${popupId}">Loading file preview…</div></div>`);
  markers.addLayer(m);

  // add to list
  const item = document.createElement('div'); item.className = 'item';
  const meta = document.createElement('div'); meta.innerHTML = `<div><strong>${i.name || 'Unnamed'} (ID ${i.custom_id || i.id})</strong></div><div class="meta">${i.description || '—'} · ${i.latitude.toFixed(4)}, ${i.longitude.toFixed(4)} · Qty: ${i.quantity || 0} · ${i.status || 'new'}</div>`;
  const btns = document.createElement('div');
  const view = document.createElement('button'); view.textContent='View'; view.onclick = ()=>{ map.setView([i.latitude, i.longitude], 16, {animate:true}); m.openPopup(); };
  const del = document.createElement('button'); del.textContent='Delete'; del.onclick = async ()=>{ if(!confirm('Delete this point?')) return; await deletePoint(i.id); };
  [view,del].forEach(b=>{ b.style.marginLeft='6px'; b.className='micro'; });

  // upload status badge and retry
  const statusBadge = document.createElement('span'); statusBadge.className = 'status-badge'; statusBadge.textContent = (i.upload_status || 'pending');
  statusBadge.style.marginLeft = '8px'; statusBadge.style.fontSize='12px';
  if(i.upload_status === 'failed'){
    statusBadge.style.color = '#ffcc00'; statusBadge.style.fontWeight='700';
    const retryBtn = document.createElement('button'); retryBtn.textContent='Retry'; retryBtn.className='micro'; retryBtn.style.marginLeft='8px'; retryBtn.onclick = ()=>{ retryUpload(i.id); };
    btns.appendChild(retryBtn);
  } else if(i.upload_status === 'uploaded'){
    statusBadge.style.color = '#4ade80';
  } else {
    statusBadge.style.color = '#94a3b8';
  }

  btns.appendChild(statusBadge);
  btns.appendChild(view); btns.appendChild(del);
  item.appendChild(meta); item.appendChild(btns);
  listEl.appendChild(item);

  // lazy load file preview when popup opens
  m.on('popupopen', async ()=>{
    const container = document.getElementById(popupId);
    if(!container) return;
    try{
      const res = await fetch(`${apiBase}/waste/${i.id}/file`);
      if(!res.ok){ container.textContent = 'No file'; return; }
      const ct = res.headers.get('content-type') || '';
      const blob = await res.blob();
      if(ct.startsWith('image/')){
        const url = URL.createObjectURL(blob);
        container.innerHTML = `<a href=\"${apiBase}/waste/${i.id}/file\" target=\"_blank\"><img src=\"${url}\" style=\"max-width:240px;max-height:160px;border-radius:8px;display:block;margin-top:8px;\"></a>`;
      } else {
        container.innerHTML = `<a href=\"${apiBase}/waste/${i.id}/file\" target=\"_blank\">Download file</a>`;
      }
    }catch(e){ container.textContent = 'No file'; }
  });
}

function addExistingItem(i){
  const existingListEl = document.getElementById('existing-list');
  const el = document.createElement('div'); el.className='ex-item';
  const left = document.createElement('div'); left.innerHTML = `<strong>${i.name || 'Unnamed'}</strong><div class="meta">ID: ${i.custom_id || i.id} · ${i.latitude.toFixed(4)}, ${i.longitude.toFixed(4)}</div>`;
  const right = document.createElement('div'); right.innerHTML = `<div class="meta">Qty: ${i.quantity||0} · ${i.status||'new'}</div>`;
  el.appendChild(left); el.appendChild(right);
  existingListEl.appendChild(el);
}

async function retryUpload(id){
  try{
    showToast('Retrying upload...');
    const res = await fetch(`${apiBase}/waste/${id}/retry`, { method: 'POST' });
    const j = await res.json().catch(()=>null);
    if(j && j.success){ showToast('Upload retried successfully'); loadMarkers(); }
    else { showToast('Retry failed: '+(j && j.message)); }
  }catch(e){ console.error(e); showToast('Retry error'); }
}

async function deletePoint(id){
  try{
    const res = await fetch(`${apiBase}/waste/${id}`, { method:'DELETE' });
    if(res.ok){ showToast('Deleted '+id); loadMarkers(); }
    else showToast('Failed to delete');
  }catch(e){ console.error(e); showToast('Error deleting'); }
}

// locate button
document.getElementById('locate').addEventListener('click', ()=>{
  map.locate({setView:true, maxZoom:14});
});

// refresh
document.getElementById('refresh').addEventListener('click', loadMarkers);

// search
document.getElementById('search').addEventListener('keypress', (e)=>{
  if(e.key==='Enter'){ const q = e.target.value.trim().toLowerCase(); if(!q) return loadMarkers(); searchList(q); }
});

function searchList(q){
  const items = Array.from(listEl.children);
  items.forEach(it=>{ const txt = it.textContent.toLowerCase(); it.style.display = txt.includes(q)?'flex':'none'; });
}

// add form
document.getElementById('addForm').addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  const form = ev.target; const fd = new FormData(form);
  try{
    const res = await fetch(`${apiBase}/waste`, { method:'POST', body: fd });
    const j = await res.json().catch(()=>null);
    if(res.ok){
      showToast('Point added');
      if(j && j.hdfs_error) showToast('Warning: '+j.hdfs_error);
      form.reset(); loadMarkers();
    } else {
      showToast('Add failed'); console.error(j);
    }
  }catch(e){ console.error(e); showToast('Error adding'); }
});

document.getElementById('pickBtn').addEventListener('click', ()=>{
  pickMode = !pickMode;
  document.getElementById('pickBtn').textContent = pickMode ? 'Click on map to set' : 'Pick on map';
  if(!pickMode && pickMarker){ map.removeLayer(pickMarker); pickMarker = null; }
});

map.on('click', function(e){
  if(!pickMode) return;
  const {lat, lng} = e.latlng;
  document.getElementById('lat').value = lat.toFixed(6);
  document.getElementById('lng').value = lng.toFixed(6);
  if(pickMarker) map.removeLayer(pickMarker);
  pickMarker = L.marker([lat, lng], {opacity:0.9}).addTo(map);
  pickMode = false; document.getElementById('pickBtn').textContent = 'Pick on map';
});

// initial load
loadMarkers();

