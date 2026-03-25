# Variant 5 – Edge Analytics Node

## Overview

This repository implements **Variant 5: Edge Analytics Node** with local data aggregation, anomaly detection, and minimal cloud communication. The system layers on top of a four-zone building simulation (Variant 4), processing all sensor data locally on the edge device and transmitting only anomaly summary notifications to the cloud.

---

## Quick Start

```bash
docker compose up -d --build
```

Open OpenHAB at **http://localhost:8080** and select the **edge_analytics** sitemap.
Statistics and anomaly detection populate within the first minute of operation.

---

## Edge Analytics Architecture

```
Sensor data (9 sensors: 4×temp, 4×CO2, 1×power)
    │
    ▼  :25s
┌──────────────────────────────────────────────────────┐
│  edge-aggregation.js – Local Data Aggregation        │
│  Circular buffers (60 samples) · SMA-5 · SMA-60     │
│  StdDev · Min/Max · Compression ratio tracking       │
│  Raw data never leaves the node                      │
└──────────────────────────────────────────────────────┘
    │  cache.shared (JSON-serialized stats per sensor)
    ▼  :30s
┌──────────────────────────────────────────────────────┐
│  edge-analytics.js – Statistical Processing          │
│  EWMA (α=0.1) · Z-score · Pearson correlation (r)   │
└──────────────────────────────────────────────────────┘
    │  cache.shared (enriched stats + Z-scores)
    ▼  :35s
┌──────────────────────────────────────────────────────┐
│  anomaly-detection.js – Anomaly Detection            │
│  Threshold · Z-score · IQR · EWMA deviation          │
│  → alert queue in cache.shared (JSON string)         │
└──────────────────────────────────────────────────────┘
    │  alert queue (summaries only)
    ▼  :40s
┌──────────────────────────────────────────────────────┐
│  cloud-alerts.js – Cloud Alert Dispatcher            │
│  Compact JSON · HTTP POST · batch optimisation       │
│  Idle when no anomalies → 0 bytes sent               │
└──────────────────────────────────────────────────────┘
    │
    ▼  HTTPS
  Cloud endpoint (alert summaries only – no raw data)
```

### Rule Execution Pipeline

The four edge analytics rules run in sequence every minute using cron offsets:

```
:25s  edge-aggregation.js   – Update buffers, compute SMA-5, SMA-60, StdDev
:30s  edge-analytics.js     – Compute EWMA, Z-scores, Pearson correlations
:35s  anomaly-detection.js  – Multi-method anomaly classification, build alert queue
:40s  cloud-alerts.js       – HTTP POST alert batch (only when anomalies present)
```

On startup all four rules also fire via `SystemStartlevelTrigger(100)` so the dashboard is immediately populated.

---

## Building Layout

| Zone | Label         | Area   | Capacity | Primary load           |
|------|---------------|--------|----------|------------------------|
| Z1   | Office        | 120 m² | 40 pers  | Workstations + HVAC    |
| Z2   | Conference    | 60 m²  | 20 pers  | AV equipment + HVAC    |
| Z3   | Lobby         | 80 m²  | 30 pers  | Lighting + HVAC        |
| Z4   | Server Room   | 30 m²  | –        | Servers (180 W/m²)     |
| **Total** |          | **290 m²** |      |                        |

---

## Local Data Aggregation

### Circular Buffering

Each sensor maintains a **60-sample circular buffer** (1 reading/min = 1 h rolling window). Buffers are stored as JSON strings in OpenHAB's `cache.shared` in-memory store for thread-safe inter-script communication.

| Sensor group    | Sensors tracked        |
|-----------------|------------------------|
| Zone temps      | Zone1…4 Temperature    |
| Zone CO2        | Zone1…4 CO2            |
| Building power  | Bld_TotalPower         |
| **Total**       | **9 sensors**          |

Buffer memory footprint: 9 sensors × 60 readings × 8 bytes = **4 320 bytes** (~4 KB).

### Time-Window Aggregations

| Statistic | Window | Description |
|-----------|--------|-------------|
| SMA-5     | 5 min  | Short-term responsive moving average |
| SMA-60    | 60 min | Long-term trend baseline |
| StdDev    | 60 min | Population standard deviation |
| Min/Max   | 60 min | Range boundaries |

### Data Compression

Rather than retaining all 60 raw readings, downstream rules consume 4 aggregate values per sensor (mean, std, min, max), achieving a **93 % compression ratio** (4 values vs 60 raw points).

---

## Statistical Methods

### Simple Moving Average (SMA)

```
SMA-5  = mean of last 5 readings   (responsive, noise-reduced)
SMA-60 = mean of all 60 readings   (trend baseline)
```

SMA-5 tracks short-term changes; SMA-60 provides the stable long-term reference against which deviations are measured.

### Standard Deviation (σ)

Population standard deviation over the full 60-sample window:

```
σ = √[ Σ(xᵢ − x̄)² / N ]
```

σ characterises the normal variability of each sensor and gates the sensitivity of Z-score and EWMA detection.

### Exponentially Weighted Moving Average (EWMA)

```
EWMA_t = α × x_t + (1 − α) × EWMA_{t-1}     α = 0.10
```

With α = 0.10, the effective memory span is ≈ 9.5 minutes. EWMA tracks long-term drift while suppressing noise. Large deviations between the current reading and EWMA forecast signal sudden state changes.

### Pearson Correlation (r)

```
r(Temp, CO2) = Σ[(xᵢ − x̄)(yᵢ − ȳ)] / √[Σ(xᵢ−x̄)² · Σ(yᵢ−ȳ)²]
```

Computed per zone over the aligned 60-sample window. In a well-ventilated zone r ≈ 0 (independent). High positive correlation (r > 0.7) suggests poor ventilation where rising occupancy drives both temperature and CO2 upward simultaneously.

---

## Anomaly Detection Algorithms

Four methods are applied in priority order; the first positive match wins.

### 1. Threshold-Based Detection

Hard physical limits that always indicate a fault condition:

| Sensor             | Min    | Max      | Warning    |
|--------------------|--------|----------|------------|
| Zone 1–3 Temp      | 14 °C  | 34 °C    | –          |
| Zone 4 Server Temp | 15 °C  | 35 °C    | ≥ 32 °C    |
| Zone CO2           | –      | 2000 ppm | ≥ 1500 ppm |
| Building Power     | –      | 200 kW   | ≥ 150 kW   |

Threshold detections bypass statistical methods and fire immediately regardless of buffer size.

### 2. Z-Score Method

```
z = (x_current − μ₆₀) / σ₆₀

Anomaly if |z| > 2.5  (≈ 99 % confidence interval)
```

Identifies readings that are statistically improbable given the recent 60-min distribution. Requires ≥ 10 buffer samples before activating.

### 3. IQR Method (Tukey Fences)

```
Q1 = 25th percentile of buffer
Q3 = 75th percentile of buffer
IQR = Q3 − Q1

Outlier if x < Q1 − 1.5 × IQR  or  x > Q3 + 1.5 × IQR
```

Robust to non-Gaussian distributions and insensitive to extreme outliers distorting the quartiles. Fires if the Z-score method did not (e.g., when σ is inflated by a previous anomaly).

### 4. EWMA Deviation Method

```
deviation = |x_current − EWMA|

Anomaly if deviation > 2 × σ₆₀
```

Detects sudden step-changes that may not yet have inflated the 60-min Z-score. Particularly effective at catching rapid onset events (e.g., server room cooling failure, sudden occupancy surge).

### Detection Priority Summary

| Priority | Method          | Condition                        | Label            |
|----------|-----------------|----------------------------------|------------------|
| 1        | Hard threshold  | x < min or x > max              | `THRESHOLD`      |
| 2        | Soft threshold  | x > warn limit                   | `THRESHOLD_WARN` |
| 3        | Z-score         | \|z\| > 2.5                      | `ZSCORE`         |
| 4        | IQR             | Tukey outlier fence              | `IQR`            |
| 5        | EWMA deviation  | \|x − EWMA\| > 2σ               | `EWMA`           |
| –        | No anomaly      | –                                | `NONE`           |

---

## Bandwidth Savings Analysis

### Baseline: Naive Raw Streaming

If all sensor readings were uploaded every minute with no filtering:

```
Raw rate = 9 sensors × 8 bytes (IEEE 754 double) = 72 B/min
         = 4 320 B/hr  =  103 680 B/day  ≈  101 KB/day
```

### Edge Approach: Alerts Only

The edge node sends a payload only when anomalies are detected:

| Scenario                | Transmission         | Bytes/min (avg) |
|-------------------------|----------------------|-----------------|
| No anomalies (idle)     | Nothing sent         | 0 B             |
| Anomaly batch (1 alert) | ~180 B JSON          | ~180 B          |
| Anomaly batch (3 alerts)| ~320 B JSON          | ~320 B          |

With an estimated anomaly rate of **≤ 5 % of minutes** (3 min/hr):

```
Edge avg rate  = 0.05 × 250 B/min  ≈  12.5 B/min
Bandwidth saved = 1 − 12.5 / 72    ≈  83 %
```

In practice savings exceed **90 %** during normal building operation (nights/weekends with no anomalies produce zero cloud traffic). The `Edge_BandwidthSaving` item tracks this live using cumulative byte accounting.

### Alert Payload Format

```json
{
  "node": "building-edge-01",
  "ts": "2026-03-25T12:00:00.000Z",
  "batch_id": 42,
  "alert_count": 2,
  "alerts": [
    { "s": "Server Temp", "type": "THRESHOLD_WARN", "sev": "CRITICAL", "val": 32.5, "mean": 28.1, "z": 2.8 },
    { "s": "Zone1 CO2",   "type": "ZSCORE",         "sev": "HIGH",     "val": 1850, "mean": 650, "z": 3.1 }
  ]
}
```

No raw sensor arrays are ever included. The payload contains only the anomaly classification, the triggering value, and the statistical context needed for cloud-side triage.

---

## Configuration

### Required OpenHAB Add-ons

Configured in `openhab/conf/services/addons.cfg`:

```
automation = jsscripting
binding = http
persistence = rrd4j,mapdb
transformation = map
ui = basic
```

The **HTTP binding** is required for `cloud-alerts.js` to dispatch anomaly batches via `actions.HTTP.sendHttpPostRequest()`.

### Cloud Endpoint

Set `CLOUD_ENDPOINT` in `cloud-alerts.js`:

```javascript
var CLOUD_ENDPOINT = 'https://httpbin.org/post';  // development echo
```

Replace with your production webhook or REST API endpoint.

### Detection Thresholds

Tunable parameters in `anomaly-detection.js`:

| Parameter        | Default | Description                                  |
|------------------|---------|----------------------------------------------|
| `Z_THRESHOLD`    | 2.5     | Standard deviations to flag Z-score anomaly  |
| `IQR_MULTIPLIER` | 1.5     | Classic Tukey outlier fence multiplier        |
| `EWMA_DEV_FACTOR`| 2.0     | Multiples of σ from EWMA to flag deviation   |
| `MIN_SAMPLES`    | 10      | Minimum buffer size before statistical methods fire |

### EWMA Smoothing

Configurable in `edge-analytics.js`:

```javascript
const EWMA_ALPHA = 0.1;  // α = 0.1 → effective memory span ≈ 9.5 min
```

### Alert Severity Mapping

The `anomaly-severity.map` transformation:

```
NONE=Normal
THRESHOLD=Hard Limit Exceeded
THRESHOLD_WARN=Near Limit
ZSCORE=Z-Score Outlier
IQR=IQR Outlier
EWMA=EWMA Trend Deviation
NULL=Unknown
```

### Threading Considerations

All inter-script communication via `cache.shared` uses JSON string serialisation to prevent threading issues:

```javascript
// Writer (edge-aggregation.js): serialise stats as JSON string
cache.shared.put('edge_stats_' + key, JSON.stringify(stats));

// Reader (edge-analytics.js): parse JSON string back to object
var stats = JSON.parse(cache.shared.get('edge_stats_' + key));

// Alert queue (anomaly-detection.js → cloud-alerts.js)
cache.shared.put('edge_alert_queue', JSON.stringify(alertQueue));
var alerts = JSON.parse(cache.shared.get('edge_alert_queue'));
```

---

## Dashboard Navigation

The **edge_analytics** sitemap contains seven frames:

1. **Edge Node Status** – buffer utilisation, compression ratio, bandwidth saving
2. **Zone 1 · Office** – SMA-5/60, StdDev, EWMA, Z-score, anomaly status, Temp–CO2 correlation
3. **Zone 2 · Conference** – same metrics
4. **Zone 3 · Lobby** – same metrics
5. **Zone 4 · Server Room** – same metrics (CRITICAL threshold for server temp ≥ 32 °C)
6. **Building Power Analytics** – power SMA, StdDev, EWMA, Z-score, anomaly type
7. **Cloud Communication** – alert status, severity, last message, bandwidth saving chart

---

## Repository File List

### Edge Analytics Node (Variant 5)

| File | Purpose |
|------|---------|
| `openhab/conf/items/edge-analytics.items` | 55+ items: buffer stats, anomaly types, cloud status |
| `openhab/conf/automation/js/edge-aggregation.js` | Circular buffer management, SMA-5/60, StdDev computation |
| `openhab/conf/automation/js/edge-analytics.js` | EWMA, Z-score, Pearson correlation |
| `openhab/conf/automation/js/anomaly-detection.js` | Z-score · IQR · EWMA · threshold multi-method detection |
| `openhab/conf/automation/js/cloud-alerts.js` | Batch HTTP POST alerts, bandwidth accounting |
| `openhab/conf/sitemaps/edge_analytics.sitemap` | 7-frame edge analytics dashboard |
| `openhab/conf/transform/anomaly-severity.map` | Anomaly type human labels |

### Infrastructure

| File | Purpose |
|------|---------|
| `docker-compose.yaml` | OpenHAB 4.3 + Mosquitto MQTT broker + MQTT simulator |
| `openhab/conf/persistence/rrd4j.persist` | Time-series history for charts |
| `openhab/conf/persistence/mapdb.persist` | Item state restore on restart |
| `openhab/conf/services/addons.cfg` | JSScripting, HTTP binding, rrd4j, mapdb, MAP, BasicUI |
| `openhab/conf/services/basicui.cfg` | Default sitemap configuration |
| `openhab/conf/services/persistence.cfg` | Default persistence backend: rrd4j |

---

## Troubleshooting

### Common Issues

1. **"Cannot retrieve item 'Zone1_Temperature'"** – Missing raw data items
   - **Fix**: Ensure all Zone* and Bld_* items are defined in `edge-analytics.items`

2. **"Failed transforming the value 'NULL'"** – Missing NULL handling in transformation
   - **Fix**: Verify `NULL=Unknown` exists in `.map` transformation files

3. **Cloud alerts not sending** – Missing HTTP binding
   - **Fix**: Ensure `binding = http` is present in `addons.cfg`

4. **"It is not recommended to store the JS object"** – Threading warning
   - **Fix**: All cache operations now use JSON string serialisation

### Validation

After configuration changes, restart the OpenHAB container:

```bash
docker compose restart openhab
```

Monitor the logs for startup completion:

```bash
docker compose logs -f openhab | grep -i "edge\|anomaly\|cloud"
```

The system should show:
- `Edge_LastAggregation` updating every minute
- `Edge_Alert_Count` reflecting anomaly detections
- `Edge_BandwidthSaving` showing bandwidth optimisation metrics
