const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { processPDFs } = require("./pdfProcessor");
const { readLogs, addWorkerLog } = require("./workerTracker");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));
app.use(express.json());

app.post("/process", upload.array("pdfs"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).send("No PDFs uploaded.");
    }

    const filePaths = req.files.map(file => file.path);
    const result = await processPDFs(filePaths);

    res.download(result.zipPath, "packing_output.zip");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing PDFs: " + err.message);
  }
});

app.get("/latest-orders", (req, res) => {
  try {
    const outputsDir = path.join(__dirname, "outputs");

    if (!fs.existsSync(outputsDir)) {
      return res.json({ orders: [] });
    }

    const folders = fs.readdirSync(outputsDir)
      .filter(name => {
        const folderPath = path.join(outputsDir, name);
        return fs.statSync(folderPath).isDirectory();
      })
      .sort()
      .reverse();

    for (const folder of folders) {
      const ordersPath = path.join(outputsDir, folder, "orders.json");

      if (fs.existsSync(ordersPath)) {
        const orders = JSON.parse(fs.readFileSync(ordersPath, "utf8"));

        return res.json({
          runId: folder,
          orders
        });
      }
    }

    res.json({ orders: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load latest orders." });
  }
});

app.post("/worker-log", (req, res) => {
  try {
    const log = addWorkerLog(req.body);

    res.json({
      success: true,
      log
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: "Could not save worker log."
    });
  }
});

app.get("/worker-logs", (req, res) => {
  try {
    res.json(readLogs());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not read worker logs." });
  }
});

app.listen(3000, () => {
  console.log("Packing app running at http://localhost:3000");
});