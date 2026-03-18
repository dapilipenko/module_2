import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
const nowIso = () => new Date().toISOString();

const devices = new Map([
  ["zb_switch_1", {
    id: "zb_switch_1",
    type: "switch",
    friendlyName: "Zigbee Switch 1",
    state: { on: false, battery: 92, lqi: 180 },
    joinedAt: nowIso(),
    lastUpdated: nowIso()
  }],
  ["zb_dimmer_1", {
    id: "zb_dimmer_1",
    type: "dimmer",
    friendlyName: "Zigbee Dimmer 1",
    state: { on: true, level: 42, battery: 86, lqi: 201 },
    joinedAt: nowIso(),
    lastUpdated: nowIso()
  }],
  ["zb_temp_1", {
    id: "zb_temp_1",
    type: "temperature",
    friendlyName: "Zigbee Temp 1",
    state: { temperature: 22.4, battery: 78, lqi: 190 },
    joinedAt: nowIso(),
    lastUpdated: nowIso()
  }]
]);

const sanitizeState = (device, patch = {}) => {
  const next = { ...device.state };
  if (typeof patch.on === "boolean") next.on = patch.on;
  if (typeof patch.level === "number") next.level = clamp(patch.level, 0, 100);
  if (typeof patch.temperature === "number") next.temperature = patch.temperature;
  if (typeof patch.battery === "number") next.battery = clamp(patch.battery, 0, 100);
  if (typeof patch.lqi === "number") next.lqi = clamp(patch.lqi, 0, 255);
  return next;
};

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: nowIso() });
});

app.get("/devices", (_req, res) => {
  res.json(Array.from(devices.values()));
});

app.get("/devices/:id", (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: "device not found" });
  res.json(device);
});

app.put("/devices/:id", (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: "device not found" });
  const patch = typeof req.body === "object" && req.body ? req.body : {};
  device.state = sanitizeState(device, patch.state ?? patch);
  device.lastUpdated = nowIso();
  res.json(device);
});

app.post("/pair", (req, res) => {
  const body = typeof req.body === "object" && req.body ? req.body : {};
  const id = body.id || `zb_${Math.random().toString(16).slice(2, 8)}`;
  const type = body.type || "switch";
  if (devices.has(id)) return res.status(409).json({ error: "device already exists" });
  const template = {
    switch: { on: false, battery: 100, lqi: 200 },
    dimmer: { on: false, level: 0, battery: 100, lqi: 200 },
    temperature: { temperature: 21.0, battery: 100, lqi: 200 }
  };
  const baseState = template[type] || template.switch;
  const device = {
    id,
    type,
    friendlyName: body.friendlyName || `Zigbee ${type} ${id}`,
    state: baseState,
    joinedAt: nowIso(),
    lastUpdated: nowIso()
  };
  devices.set(id, device);
  res.status(201).json(device);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`zigbee-mock listening on ${port}`);
});
