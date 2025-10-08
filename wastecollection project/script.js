let bins = [];
let editIndex = -1;
let mainMap, pickerMap, pickerMarker;
let markers = [];

window.onload = async function () {
  mainMap = L.map("mainMap").setView([31.582045, 74.329376], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
  }).addTo(mainMap);

  await loadBins();
  renderTable();
  updateStats();
};

async function loadBins() {
  const res = await fetch("/bins");
  const text = await res.text();
  const lines = text.trim().split("\n");

  bins = lines.map((line) => {
    const [binId, location, fill, status, last, lat, lon] = line.split(",");
    return {
      binId: binId.trim(),
      location: location.trim(),
      fill: parseInt(fill),
      status: status.trim(),
      last: last.trim(),
      lat: parseFloat(lat),
      lon: parseFloat(lon),
    };
  });
}

function renderMapMarkers() {
  markers.forEach((m) => mainMap.removeLayer(m));
  markers = [];

  bins.forEach((bin) => {
    let color = bin.fill > 75 ? "red" : bin.fill > 40 ? "orange" : "green";
    let marker = L.circleMarker([bin.lat, bin.lon], {
      color,
      radius: 10,
      fillOpacity: 0.8,
    })
      .addTo(mainMap)
      .bindPopup(`<b>${bin.location}</b><br>Fill: ${bin.fill}%<br>Status: ${bin.status}`);
    markers.push(marker);
  });
}

function renderTable() {
  const tbody = document.querySelector("#binTable tbody");
  tbody.innerHTML = "";
  bins.forEach((bin, i) => {
    tbody.innerHTML += `
      <tr>
        <td>${bin.binId}</td>
        <td>${bin.location}</td>
        <td>${bin.fill}</td>
        <td>${bin.status}</td>
        <td>${bin.last}</td>
        <td>
          <button onclick="editBin(${i})">Edit</button>
          <button style="background:red;color:white" onclick="deleteBin(${i})">Delete</button>
        </td>
      </tr>`;
  });
  renderMapMarkers();
  updateStats();
}

document.getElementById("binForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const bin = {
    binId: document.getElementById("binId").value,
    location: document.getElementById("location").value,
    fill: parseInt(document.getElementById("fill").value),
    status: document.getElementById("status").value,
    last: document.getElementById("last").value,
    lat: parseFloat(document.getElementById("lat").value),
    lon: parseFloat(document.getElementById("lon").value),
  };

  if (editIndex === -1) bins.push(bin);
  else bins[editIndex] = bin;

  await fetch("/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bins),
  });

  document.getElementById("binForm").reset();
  editIndex = -1;
  renderTable();
});

function editBin(i) {
  const b = bins[i];
  editIndex = i;
  document.getElementById("binId").value = b.binId;
  document.getElementById("location").value = b.location;
  document.getElementById("fill").value = b.fill;
  document.getElementById("status").value = b.status;
  document.getElementById("last").value = b.last;
  document.getElementById("lat").value = b.lat;
  document.getElementById("lon").value = b.lon;
}

async function deleteBin(i) {
  if (confirm("Delete this bin?")) {
    bins.splice(i, 1);
    await fetch("/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bins),
    });
    renderTable();
  }
}

function updateStats() {
  document.getElementById("totalBins").textContent = bins.length;
  const avg = bins.length ? (bins.reduce((a, b) => a + b.fill, 0) / bins.length).toFixed(1) : 0;
  document.getElementById("avgFill").textContent = avg + "%";
  document.getElementById("fullBins").textContent = bins.filter((b) => b.fill >= 80).length;
}

function openPickerMap() {
  const modal = document.getElementById("pickerModal");
  modal.style.display = "flex";

  setTimeout(() => {
    if (!pickerMap) {
      pickerMap = L.map("pickerMap").setView([31.582045, 74.329376], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
      }).addTo(pickerMap);

      pickerMap.on("click", (e) => {
        const { lat, lng } = e.latlng;
        document.getElementById("lat").value = lat.toFixed(6);
        document.getElementById("lon").value = lng.toFixed(6);
        if (pickerMarker) pickerMap.removeLayer(pickerMarker);
        pickerMarker = L.marker([lat, lng]).addTo(pickerMap);
      });
    }
  }, 300);
}

function closePicker() {
  document.getElementById("pickerModal").style.display = "none";
}
