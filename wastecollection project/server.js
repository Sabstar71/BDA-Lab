const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get("/bins", (req, res) => {
  const dataPath = path.join(__dirname, "data.txt");
  const data = fs.readFileSync(dataPath, "utf8");
  res.send(data);
});

app.post("/update", (req, res) => {
  const dataPath = path.join(__dirname, "data.txt");
  const bins = req.body;

  const text = bins
    .map(
      (b) =>
        `${b.binId},${b.location},${b.fill},${b.status},${b.last},${b.lat},${b.lon}`
    )
    .join("\n");

  fs.writeFileSync(dataPath, text, "utf8");
  res.json({ message: "Data updated successfully" });
});

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
