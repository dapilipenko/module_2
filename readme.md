# OpenHAB Variant 4 – Building Automation Analytics

This repository implements **Variant 4: Building Management System** with HVAC optimisation, occupancy-based scheduling, comfort index calculation, and energy efficiency scoring.

The system simulates a four-zone commercial building, applies a thermal model driven by occupancy patterns and real-time HVAC decisions, and exposes all metrics through a comprehensive OpenHAB dashboard.

---

## Quick Start

```bash
docker compose up -d --build
```

Open OpenHAB at **http://localhost:8080** and select the **building** sitemap.
The simulation pre-warms 90 minutes of synthetic history on every startup so charts and analytics are populated immediately.

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

## Architecture

```
openhab/conf/
├── items/
│   └── building.items           # Variant 4 building automation items
├── automation/js/
│   ├── building-simulation.js         # Zone thermal model + occupancy
│   ├── hvac-rules.js                  # HVAC optimisation + power calculation
│   └── efficiency-calculations.js     # PMV comfort + energy metrics + occupancy analytics
├── sitemaps/
│   └── building.sitemap         # Variant 4 building automation dashboard
├── persistence/
│   ├── rrd4j.persist            # Time-series persistence (gRrd* group)
│   └── mapdb.persist            # Restart-restore persistence (gMapDb* group)
├── services/
│   ├── addons.cfg               # JSScripting + rrd4j + mapdb + MAP + BasicUI
│   ├── basicui.cfg              # Default sitemap: analytics
│   └── persistence.cfg          # Default backend: rrd4j
└── transform/
    ├── hvac-mode.map            # HEAT/COOL/FAN/OFF → human labels
    ├── comfort-level.map        # EXCELLENT … UNACCEPTABLE → human labels
    ├── occupancy-status.map     # UNOCCUPIED … PEAK → human labels
    └── efficiency-rating.map    # A … E → human labels
```

---

## Rule Execution Pipeline

The three building rule files run in sequence every minute using cron offsets:

```
:00 s  building-simulation.js   – Update outdoor conditions, zone temps/humidity/CO2, occupancy
:05 s  hvac-rules.js            – Compute setpoints, HVAC modes, and power consumption
:15 s  efficiency-calculations.js – Compute PMV, energy metrics, occupancy analytics
```

On startup all three rules also fire via `SystemStartlevelTrigger(100)` so the dashboard is immediately populated.

---

## HVAC Optimisation Algorithm

### Per-zone setpoint logic

```
occupied or pre-conditioning (30-min look-ahead):
    setpoint = comfort_target   (22 °C office, 21 °C conf, 20 °C lobby)
    + 0.5 °C  if outdoor < 0 °C   (draught compensation)
    + 0.5 °C  if outdoor > 32 °C  (peak-load relief)

unoccupied / economy mode:
    setpoint = 16 °C            (frost protection,  if outdoor < 10 °C)
    setpoint = comfort + 4 °C   (passive tolerance, otherwise)

server room (Z4): constant 20 °C cooling target, no heating ever
```

### Mode decision

| Condition                        | Mode  |
|----------------------------------|-------|
| temp < setpoint − 0.5 °C        | HEAT  |
| temp > setpoint + 0.5 °C        | COOL  |
| \|error\| ≤ 0.3 °C              | OFF   |
| otherwise                        | FAN   |
| server room always               | COOL / FAN (never HEAT) |

### Power model

| Mode  | Formula                                          | Cap          |
|-------|--------------------------------------------------|--------------|
| HEAT  | ΔT × area × 25 W/(°C·m²)                       | 55 W/m²      |
| COOL  | ΔT × area × 30 W/(°C·m²)                       | 65 W/m²      |
| FAN   | area × 3 W/m²                                   | –            |
| OFF   | 0 W                                              | –            |

### Additional loads

| Category  | Office  | Conference | Lobby  | Server Room |
|-----------|---------|------------|--------|-------------|
| Lighting  | 10 W/m² | 12 W/m²   | 8 W/m² | 5 W/m²      |
| Equipment | 15 W/m² | 5 W/m²    | 8 W/m² | 180 W/m²    |

Lighting is only applied when the zone is occupied.

---

## Occupancy Pattern Simulation

Zone occupancy is modelled as a deterministic function of time-of-day and day-of-week with small stochastic noise.

| Zone          | Weekday schedule                                        | Peak        |
|---------------|---------------------------------------------------------|-------------|
| Office        | 8:00–18:30, Gaussian arrival/departure, lunch dip       | ~40 persons |
| Conference    | Meeting blocks 9–11, 11–12, 13–15, 15–17 (75 % prob)  | ~20 persons |
| Lobby         | 7:00–19:00, peaks at arrival, lunch, departure          | ~30 persons |
| Server Room   | Random technician visits (~1/hour on weekdays)          | 1 person    |

The HVAC controller looks **30 minutes ahead** (pre-conditioning) so zones reach comfort temperature before occupancy begins.

---

## Comfort Index Calculation

### PMV – Predicted Mean Vote (ISO 7730 Fanger model)

The full ISO 7730 iterative formula is implemented in `efficiency-calculations.js`:

```
PMV = (0.303 · e^(-0.036·M) + 0.028) · L

L = (M−W) − 3.05×10⁻³ · (5733 − 6.99·(M−W) − pₐ)
           − 0.42  · ((M−W) − 58.15)
           − 1.7×10⁻⁵ · M · (5867 − pₐ)
           − 0.0014 · M · (34 − tₐ)
           − 3.96×10⁻⁸ · fcl · ((tcl+273)⁴ − (tr+273)⁴)
           − fcl · hc · (tcl − tₐ)
```

**Default parameters** for office occupants:

| Parameter            | Value  | Notes                         |
|----------------------|--------|-------------------------------|
| M (metabolic rate)   | 1.2 met | Sedentary / light office work |
| Icl (clothing)       | 1.0 clo | Winter; 0.5 clo in summer    |
| v (air velocity)     | 0.1 m/s | Near-still indoor air        |
| W (external work)    | 0       | No mechanical work           |

Server room uses 1.6 met / 0.7 clo (active technician in workwear).

**PMV scale:** −3 (cold) … 0 (neutral/comfortable) … +3 (hot).
ASHRAE 55 / ISO 7730 acceptable range: **−0.5 ≤ PMV ≤ +0.5**.

### Comfort Index (0–100 %)

```
ComfortIndex = max(0,  100 · (1 − |PMV|/3)^1.2)
```

### Overall Building Comfort Score

```
OverallComfort = ZoneComfortAvg × 0.80 + HumidityComfort × 0.20
```

Where `ZoneComfortAvg` is area-weighted over **occupied** zones only, and `HumidityComfort` is 100 % within 30–60 % RH, penalised outside that range.

### Temperature Deviation

```
TempDeviation = MeasuredTemp − HVACSetpoint  [°C]
```

Positive → above setpoint (too warm), negative → below setpoint (too cool).

---

## Energy Efficiency Metrics

### Energy Use Intensity (EUI)

```
EUI  [kWh/m²/yr] = TotalPower [W] / TotalArea [m²] × 8.76
```

This annualises the current instantaneous power over the total floor area.

**Reference values for this building type:**

| EUI range           | Classification        |
|---------------------|-----------------------|
| ≤ 150 kWh/m²/yr    | Excellent (target)    |
| 150 – 220           | Good                  |
| 220 – 300           | Average               |
| > 300 kWh/m²/yr    | Poor                  |

### Efficiency Score (0–100 %)

```
Score = clamp(100 − (EUI − 100) / 3,  0,  100)
```

Maps EUI = 100 → 100 %, EUI = 400 → 0 %.

### Efficiency Rating (A–E)

| Score  | Rating |
|--------|--------|
| ≥ 85   | A      |
| ≥ 70   | B      |
| ≥ 55   | C      |
| ≥ 40   | D      |
| < 40   | E      |

### Improvement Suggestions

The system generates a single highest-priority suggestion each cycle:

1. Server room share > 55 % → recommend server virtualisation
2. HVAC share > 40 % → improve insulation / scheduling
3. EUI > 350 → full energy audit
4. EUI > 250 → LED upgrade + smarter HVAC
5. HVAC active in unoccupied zone → scheduling error detected
6. Within target → positive confirmation

---

## Thermal Simulation Model

Zone temperatures are governed by a differential model (per-minute step):

```
T_new = T_prev
      + (T_outdoor − T_prev) × 0.008        (thermal drift toward outdoor)
      + (T_setpoint − T_prev) × HVAC_rate   (HVAC correction)
      + Occupancy × 0.04 °C/person           (body heat gain)
      + noise(0.12 °C)
```

HVAC rates: HEAT = 0.15 / min, COOL = 0.12 / min, FAN = 0.02 / min.
Effective thermal time constant ≈ 125 min (insulated commercial building).

Humidity and CO2 follow analogous first-order models driven by occupancy and ventilation rate.

---

## Occupancy Analytics

Computed in `efficiency-calculations.js` on a rolling 60-minute buffer:

| Metric              | Method                                               |
|---------------------|------------------------------------------------------|
| Peak occupancy      | Maximum count in rolling 60-min window              |
| Peak time           | Timestamp of the peak sample                        |
| 60-min prediction   | Time-pattern interpolation (Gaussian schedule)      |
| Occupancy trend     | Rate of change (persons/hour) over last 15 samples  |
| Active zones        | Count of zones with occupancy > 0                   |
| Zone usage pattern  | Comma-separated label:count for occupied zones      |

---

## Repository File List

### Building Automation (Variant 4)

| File | Purpose |
|------|---------|
| `openhab/conf/items/building.items` | 70+ items: sensors, HVAC, comfort, energy, occupancy |
| `openhab/conf/automation/js/building-simulation.js` | Zone thermal model + occupancy schedule simulation |
| `openhab/conf/automation/js/hvac-rules.js` | HVAC setpoint optimisation + power calculation |
| `openhab/conf/automation/js/efficiency-calculations.js` | PMV · energy EUI · occupancy analytics |
| `openhab/conf/sitemaps/building.sitemap` | Dashboard: 7 frames covering all metrics |
| `openhab/conf/transform/hvac-mode.map` | HVAC mode human labels |
| `openhab/conf/transform/comfort-level.map` | Comfort level human labels |
| `openhab/conf/transform/occupancy-status.map` | Occupancy band human labels |
| `openhab/conf/transform/efficiency-rating.map` | A–E rating human labels |

### Infrastructure

| File | Purpose |
|------|---------|
| `docker-compose.yaml` | OpenHAB 4.3 + Mosquitto MQTT |
| `openhab/conf/persistence/rrd4j.persist` | Time-series history for charts |
| `openhab/conf/persistence/mapdb.persist` | Item state restore on restart |
| `openhab/conf/services/addons.cfg` | JSScripting, rrd4j, mapdb, MAP, BasicUI |

---

## Dashboard Navigation

The **building** sitemap contains seven frames:

1. **Building Overview** – system status, total occupancy, power, comfort score, EUI, rating
2. **Zone 1 · Office** – temperature, humidity, CO2, occupancy, HVAC state, PMV, comfort chart
3. **Zone 2 · Conference** – same metrics for conference room
4. **Zone 3 · Lobby** – same metrics for lobby
5. **Zone 4 · Server Room** – temperature, HVAC cooling, server load
6. **Comfort Analysis** – PMV per zone, building comfort score, humidity comfort, 24-h chart
7. **Energy Efficiency Dashboard** – power breakdown, EUI, efficiency score/rating, suggestion, charts
8. **Occupancy Analytics** – current / predicted / peak occupancy, zone pattern, trend, 24-h chart
9. **HVAC System Summary** – per-zone mode, setpoint, HVAC power total

