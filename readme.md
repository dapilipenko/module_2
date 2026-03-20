# OpenHAB Variant 3 - Multi-Sensor Analytics

This repository implements Variant 3: Multi-Sensor Analytics. The goal is to build an analytical system for 5+ virtual sensors with correlation analysis and trend detection in OpenHAB.
The configuration simulates seven virtual sensors, stores history with rrd4j and mapdb, computes rolling statistics and cross-sensor correlation, and exposes the results in a sitemap called analytics.

## Task summary

Implement an analytics pipeline for virtual sensors with:

- Virtual sensors (5+ types) with realistic simulated data patterns, noise, and seasonal variations.
- Data correlation analysis, including a correlation matrix, lead-lag detection, and causality hints.
- Statistical computations in rules: SMA, EMA, standard deviation, min/max, and percentile metrics.
- Trend detection: linear regression slope, trend direction, change-point detection, and forecasting.
- OpenHAB items for sensors and calculated results, persistence for history, MAP transforms, and a sitemap with charts.

## How the requirements are met

### 1) Virtual sensors (5+ types)

Seven sensors are simulated every minute with seasonal and daily patterns plus noise:

- Outdoor/Indoor Temperature
- Outdoor/Indoor Humidity
- Barometric Pressure
- CO2
- Daylight

### 2) Data correlation analysis

- Pearson correlation for key sensor pairs.
- Full correlation matrix rendered as text rows.
- Lead-lag analysis with a best-lag selection.
- Heuristic causality text based on lag-improvement vs zero-lag baseline.

### 3) Statistical computations in rules

- SMA(15), EMA(30), StdDev(30), Min/Max(60).
- Percentiles: P90 for outdoor temperature, P95 for CO2.

### 4) Trend detection

- Linear regression slope over recent samples.
- Trend direction (up/down/stable) classification.
- Change-point detection on a rolling window.
- Forecast +60 minutes with linear extrapolation.

### 5) OpenHAB configuration artifacts

- Items for sensors and computed metrics.
- JS rules for simulation and analytics.
- Persistence (rrd4j + mapdb) for charts and restart restore.
- MAP transforms for human-friendly labels.
- Sitemap with charts and analytics widgets.

## Architecture: Base OpenHAB configuration

```
openhab/
├── conf/
│ ├── persistence/ # Persistence strategies
│ ├── items/ # Items with metadata
│ ├── rules/ # Analytics rules
│ └── sitemaps/ # Charts
└── addons/
   └── persistence/ # InfluxDB, rrd4j, JDBC
```

## Repository layout

- openhab/conf/items/analytics.items
- openhab/conf/automation/js/virtual-sensor-simulation.js
- openhab/conf/automation/js/multi-sensor-analytics.js
- openhab/conf/persistence/mapdb.persist
- openhab/conf/persistence/rrd4j.persist
- openhab/conf/services/addons.cfg
- openhab/conf/services/basicui.cfg
- openhab/conf/services/persistence.cfg
- openhab/conf/services/rrd4j.cfg
- openhab/conf/services/runtime.cfg
- openhab/conf/transform/correlation-band.map
- openhab/conf/transform/trend.map
- openhab/conf/sitemaps/analytics.sitemap
- openhab/addons/persistence/README.md
- docs/analytics-results.md

## Sensor specifications

1. Outdoor Temperature
   Seasonal baseline, day-night sine wave, pressure coupling, and deterministic noise.
2. Indoor Temperature
   Lagged outdoor temperature, occupancy heat gain, and smaller stochastic variation.
3. Outdoor Humidity
   Inverse relation to outdoor temperature, pressure influence, and cloud-driven variability.
4. Indoor Humidity
   Lagged outdoor humidity, indoor temperature dependence, and occupancy moisture effect.
5. Barometric Pressure
   Slow weather-front oscillation with seasonal drift.
6. CO2
   Occupancy-driven indoor air-quality indicator with humidity and temperature coupling.
7. Daylight
   Seasonal sunrise-sunset envelope with cloud attenuation.

## Statistical algorithms

- SMA over the latest 15 samples.
- EMA over the latest 30 samples.
- Standard deviation over the latest 30 samples.
- Min and Max over the latest 60 samples.
- Percentile P90 for outdoor temperature and P95 for CO2.
- Pearson correlation for key sensor pairs and the full correlation matrix.
- Lead-lag search over plus or minus 8 samples.
- Heuristic causality score from lagged-correlation improvement.
- Linear regression slope over the latest 45 samples.
- Trend direction classification into UP, DOWN, or STABLE.
- Change point detection from the last 20 samples.
- Forecasting by linear extrapolation 60 minutes ahead.

## Correlation matrix example

A sample matrix and interpretation are documented in docs/analytics-results.md.
Typical relations in this model are:

- Outdoor temperature and indoor temperature: strong positive correlation.
- Outdoor temperature and outdoor humidity: strong negative correlation.
- Barometric pressure and outdoor humidity: moderate negative correlation.
- Daylight and outdoor temperature: positive relation with a short lead-lag delay.
- CO2 and indoor humidity: positive relation driven by occupancy.

## Trend analysis results

Expected dashboard outputs include:

- Outdoor temperature trend direction and 60-minute forecast.
- Barometric pressure trend direction and 60-minute forecast.
- Change-point indicators for temperature and pressure.
- Rolling averages and percentile values for the simulated sensors.
- Lead-lag and causality text for the outdoor-indoor temperature pair and daylight-temperature pair.

## OpenHAB configuration notes

- docker-compose.yaml already mounts openhab/conf and openhab/addons, so the new structure is active without further path changes.
- JS Scripting is enabled through addons.cfg.
- rrd4j is the default persistence backend for history charts.
- mapdb restores calculated states on restart.
- MAP transforms render trend and correlation band labels in the sitemap.
- The analytics rule keeps rolling windows in memory and fills the charts as persisted history accumulates.

## Running the stack

1. Start the services with docker compose up -d --build.
2. Open OpenHAB at http://localhost:8080.
3. Open the sitemap named analytics.
4. Wait for the first minute of simulated data and the rolling analytics warm-up.
5. Review the charts, pairwise correlation values, matrix rows, trend flags, and forecasts.

## Files to submit

- Sensor simulation rules: openhab/conf/automation/js/virtual-sensor-simulation.js
- Analytics rules: openhab/conf/automation/js/multi-sensor-analytics.js
- Chart configuration: openhab/conf/sitemaps/analytics.sitemap
- Results documentation: docs/analytics-results.md
