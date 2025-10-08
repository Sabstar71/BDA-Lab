// generateData.js
const fs = require("fs");

// Define zones and statuses
const zones = [
  "Model Town", "Johar Town", "Gulberg", "Township", "Wapda Town",
  "Iqbal Town", "Garden Town", "Cantt", "DHA", "Faisal Town",
  "Walton", "Shalimar", "Samanabad", "Bahria Town", "LDA Avenue",
  "Valencia", "Sabzazar", "Allama Iqbal Town", "Shadman", "Ferozepur Road"
];

const statuses = [
  "Low", "Moderate", "Half Full", "Almost Full", "Needs Collection", "Overflow"
];

let data = "";

// Generate 1000 random bins
for (let i = 1; i <= 1000; i++) {
  const zone = zones[i % zones.length];
  const fill = Math.floor(Math.random() * 100);
  const status = statuses[Math.floor(fill / 17)];
  
  // Lahore region coordinates (random within bounding box)
  const lat = (31.40 + Math.random() * 0.25).toFixed(6); // 31.40–31.65
  const lon = (74.20 + Math.random() * 0.25).toFixed(6); // 74.20–74.45

  const date = `2025-10-08 ${String(Math.floor(Math.random() * 12 + 8)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;

  data += `BIN${String(i).padStart(4, "0")},${zone} - Street ${i},${fill},${status},${date},${lat},${lon}\n`;
}

// Write to file
fs.writeFileSync("data.txt", data);
console.log("✅ data.txt with 1000 Lahore bins created successfully!");
