'use strict';
// ============================================================
// Variant 5: Edge Analytics Node
// anomaly-detection.js  –  Multi-method Anomaly Detection
//
// Runs at second 35 of every minute (after edge-analytics.js).
// Reads enriched statistics from the shared cache and applies
// four complementary detection methods in priority order:
//
//   1. THRESHOLD      – hard physical limits (always alarm)
//   2. THRESHOLD_WARN – soft warning limits
//   3. ZSCORE         – |z| > Z_THRESHOLD (statistical outlier)
//   4. IQR            – outside Q1 − 1.5×IQR … Q3 + 1.5×IQR
//   5. EWMA           – deviation from EWMA forecast > 2×σ
//
// Each sensor gets an AnomalyType string item (NONE / method).
// Detected anomalies are collected in the shared alert queue
// for cloud-alerts.js to dispatch in the next pipeline stage.
// ============================================================
const { items, log, rules, triggers } = require('openhab');
const logger = log('anomaly-detection');

// ─── Detection parameters ─────────────────────────────────────────────────
var Z_THRESHOLD      = 2.5;  // standard deviations to flag Z-score anomaly
var IQR_MULTIPLIER   = 1.5;  // classic Tukey outlier fence multiplier
var EWMA_DEV_FACTOR  = 2.0;  // multiples of σ from EWMA to flag deviation
var MIN_SAMPLES      = 10;   // minimum buffer size before statistical methods fire

// ─── Hard / soft thresholds per sensor ───────────────────────────────────
var LIMITS = {
  z1_temp:   { min: 14,    max: 34,    warn: null,  label: 'Zone1 Temp [°C]'        },
  z2_temp:   { min: 14,    max: 34,    warn: null,  label: 'Zone2 Temp [°C]'        },
  z3_temp:   { min: 12,    max: 34,    warn: null,  label: 'Zone3 Temp [°C]'        },
  z4_temp:   { min: 15,    max: 35,    warn: 32,    label: 'Server Temp [°C]'       },
  z1_co2:    { min: null,  max: 2000,  warn: 1500,  label: 'Zone1 CO2 [ppm]'        },
  z2_co2:    { min: null,  max: 2000,  warn: 1500,  label: 'Zone2 CO2 [ppm]'        },
  z3_co2:    { min: null,  max: 2000,  warn: 1500,  label: 'Zone3 CO2 [ppm]'        },
  z4_co2:    { min: null,  max: 3000,  warn: null,  label: 'Server CO2 [ppm]'       },
  bld_power: { min: null,  max: 200000, warn: 150000, label: 'Building Power [W]'   }
};

// ─── Sensor-to-item output mapping ────────────────────────────────────────
var DETECTORS = [
  { key: 'z1_temp',   anomalyItem: 'Zone1_Temp_AnomalyType',  severity: 'MEDIUM',   desc: 'Zone1 Temp'    },
  { key: 'z1_co2',    anomalyItem: 'Zone1_CO2_AnomalyType',   severity: 'HIGH',     desc: 'Zone1 CO2'     },
  { key: 'z2_temp',   anomalyItem: 'Zone2_Temp_AnomalyType',  severity: 'MEDIUM',   desc: 'Zone2 Temp'    },
  { key: 'z2_co2',    anomalyItem: 'Zone2_CO2_AnomalyType',   severity: 'HIGH',     desc: 'Zone2 CO2'     },
  { key: 'z3_temp',   anomalyItem: 'Zone3_Temp_AnomalyType',  severity: 'MEDIUM',   desc: 'Zone3 Temp'    },
  { key: 'z3_co2',    anomalyItem: 'Zone3_CO2_AnomalyType',   severity: 'HIGH',     desc: 'Zone3 CO2'     },
  { key: 'z4_temp',   anomalyItem: 'Zone4_Temp_AnomalyType',  severity: 'CRITICAL', desc: 'Server Temp'   },
  { key: 'z4_co2',    anomalyItem: 'Zone4_CO2_AnomalyType',   severity: 'LOW',      desc: 'Server CO2'    },
  { key: 'bld_power', anomalyItem: 'Bld_Power_AnomalyType',   severity: 'HIGH',     desc: 'Building Power'}
];

// ─── IQR outlier fence check ──────────────────────────────────────────────
function isIQROutlier(buf, val) {
  if (!buf || buf.length < MIN_SAMPLES) return false;
  var sorted = buf.slice().sort(function (a, b) { return a - b; });
  var q1 = sorted[Math.floor(sorted.length * 0.25)];
  var q3 = sorted[Math.floor(sorted.length * 0.75)];
  var iqr = q3 - q1;
  if (iqr === 0) return false;  // all values identical – no spread
  return val < (q1 - IQR_MULTIPLIER * iqr) || val > (q3 + IQR_MULTIPLIER * iqr);
}

// ─── EWMA deviation check ─────────────────────────────────────────────────
function isEWMADeviation(stats) {
  if (!stats || stats.ewma === undefined || stats.std === 0) return false;
  return Math.abs(stats.current - stats.ewma) > (EWMA_DEV_FACTOR * stats.std);
}

// ─── Classify anomaly (highest-priority method wins) ─────────────────────
// Returns 'NONE' | 'THRESHOLD' | 'THRESHOLD_WARN' | 'ZSCORE' | 'IQR' | 'EWMA'
function classify(key, stats) {
  if (!stats || stats.buf.length < 3) return 'NONE';
  var val  = stats.current;
  var lim  = LIMITS[key];

  // 1. Hard threshold
  if (lim) {
    if ((lim.min !== null && val < lim.min) || (lim.max !== null && val > lim.max)) {
      return 'THRESHOLD';
    }
    // 2. Soft warning threshold
    if (lim.warn !== null && val > lim.warn) {
      return 'THRESHOLD_WARN';
    }
  }

  // Statistical methods require a minimum buffer size
  if (stats.buf.length < MIN_SAMPLES) return 'NONE';

  // 3. Z-score: current value more than Z_THRESHOLD σ from mean
  if (stats.std > 0 && stats.zscore !== undefined &&
      Math.abs(stats.zscore) > Z_THRESHOLD) {
    return 'ZSCORE';
  }

  // 4. IQR: Tukey outlier fences
  if (isIQROutlier(stats.buf, val)) return 'IQR';

  // 5. EWMA deviation: current drifted too far from smoothed trend
  if (isEWMADeviation(stats)) return 'EWMA';

  return 'NONE';
}

// ─── Main detection run ───────────────────────────────────────────────────
function runDetection() {
  var alertQueue = [];
  var anyAnomaly = false;

  for (var i = 0; i < DETECTORS.length; i++) {
    var d     = DETECTORS[i];
    var statsRaw = cache.shared.get('edge_stats_' + d.key);
    if (statsRaw === null) continue;
    var stats;
    try { stats = JSON.parse(statsRaw); } catch (e) { continue; }

    var anomalyType = classify(d.key, stats);
    items.getItem(d.anomalyItem).postUpdate(anomalyType);

    if (anomalyType !== 'NONE') {
      anyAnomaly = true;
      alertQueue.push({
        sensor:   d.desc,
        key:      d.key,
        type:     anomalyType,
        severity: d.severity,
        value:    Math.round(stats.current * 10) / 10,
        mean:     Math.round(stats.mean    * 10) / 10,
        std:      Math.round(stats.std     * 100) / 100,
        zscore:   stats.zscore !== undefined
                    ? Math.round(stats.zscore * 100) / 100
                    : null,
        ts:       new Date().toISOString()
      });
      logger.debug(d.desc + ' → ' + anomalyType +
                   ' val=' + stats.current.toFixed(1) +
                   ' mean=' + stats.mean.toFixed(1) +
                   ' z=' + (stats.zscore !== undefined ? stats.zscore.toFixed(2) : 'n/a'));
    }
  }

  // Publish alert queue to shared cache for cloud-alerts.js
  // Store as JSON string to avoid threading issues with JS objects
  cache.shared.put('edge_alert_queue', JSON.stringify(alertQueue));
  items.getItem('Edge_Alert_Count').postUpdate(alertQueue.length);

  if (anyAnomaly) {
    items.getItem('Edge_Alert_Active').postUpdate('ON');
    // Escalate to highest severity present
    var sevOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    var highestSev = 'LOW';
    for (var s = 0; s < sevOrder.length; s++) {
      for (var a = 0; a < alertQueue.length; a++) {
        if (alertQueue[a].severity === sevOrder[s]) { highestSev = sevOrder[s]; break; }
      }
      if (highestSev === sevOrder[s]) break;
    }
    items.getItem('Edge_Alert_Severity').postUpdate(highestSev);
  } else {
    items.getItem('Edge_Alert_Active').postUpdate('OFF');
    items.getItem('Edge_Alert_Severity').postUpdate('NONE');
  }

  logger.debug('Detection complete: ' + alertQueue.length + ' anomalies');
}

// ─── Rules ────────────────────────────────────────────────────────────────
rules.JSRule({
  id:          'anomaly-detection-startup',
  name:        'Anomaly Detection – startup',
  description: 'Variant 5: Initial anomaly scan on system startup.',
  triggers:    [triggers.SystemStartlevelTrigger(100)],
  execute: function () {
    try { runDetection(); } catch (e) { logger.error('Startup detection failed: ' + e); }
  }
});

rules.JSRule({
  id:          'anomaly-detection-cron',
  name:        'Anomaly Detection – every minute',
  description: 'Variant 5: Multi-method anomaly detection (Z-score, IQR, EWMA, threshold).',
  triggers:    [triggers.GenericCronTrigger('35 * * * * ?')],
  execute: function () {
    try { runDetection(); } catch (e) { logger.error('Detection failed: ' + e); }
  }
});
