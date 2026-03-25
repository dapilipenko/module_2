'use strict';
// ============================================================
// Variant 5: Edge Analytics Node
// edge-aggregation.js  –  Local Data Aggregation
//
// Runs at second 25 of every minute (after Variant 4 pipeline).
// Reads current sensor values from OpenHAB items, maintains
// per-sensor circular buffers (60-min rolling window) in the
// shared cache, then computes time-window statistics:
//   SMA-5  : simple moving average over last 5 readings
//   SMA-60 : simple moving average over full 60-min buffer
//   StdDev : population standard deviation of full buffer
// Writes summary statistics to OpenHAB items.
// Does NOT send anything to cloud – raw data stays on-device.
// ============================================================
const { items, log, rules, triggers } = require('openhab');
const logger = log('edge-aggregation');

// ─── Configuration ────────────────────────────────────────────────────────
const BUFFER_MAX  = 60;   // 60 one-minute readings = 1 h rolling window
const WINDOW_5    = 5;    // 5-min short window for responsive SMA
// Raw bytes if every reading were streamed to cloud: 9 sensors × 8 B = 72 B/min
const RAW_BYTES_PER_MIN = 9 * 8;

// ─── Sensor descriptor table ─────────────────────────────────────────────
// key      : shared-cache key for this sensor's buffer
// item     : source OpenHAB item name
// sma5Item : item to receive 5-min SMA (null = not published)
// sma60Item: item to receive 60-min SMA
// stdItem  : item to receive standard deviation (null = not published)
const SENSORS = [
  { key: 'z1_temp',   item: 'Zone1_Temperature', sma5: 'Zone1_Temp_SMA5',  sma60: 'Zone1_Temp_SMA60',  std: 'Zone1_Temp_StdDev',  variance: 'Zone1_Temp_Variance'  },
  { key: 'z1_co2',    item: 'Zone1_CO2',          sma5: 'Zone1_CO2_SMA5',   sma60: 'Zone1_CO2_SMA60',   std: null,                  variance: null                    },
  { key: 'z2_temp',   item: 'Zone2_Temperature', sma5: 'Zone2_Temp_SMA5',  sma60: 'Zone2_Temp_SMA60',  std: 'Zone2_Temp_StdDev',  variance: 'Zone2_Temp_Variance'  },
  { key: 'z2_co2',    item: 'Zone2_CO2',          sma5: 'Zone2_CO2_SMA5',   sma60: 'Zone2_CO2_SMA60',   std: null,                  variance: null                    },
  { key: 'z3_temp',   item: 'Zone3_Temperature', sma5: 'Zone3_Temp_SMA5',  sma60: 'Zone3_Temp_SMA60',  std: 'Zone3_Temp_StdDev',  variance: 'Zone3_Temp_Variance'  },
  { key: 'z3_co2',    item: 'Zone3_CO2',          sma5: 'Zone3_CO2_SMA5',   sma60: 'Zone3_CO2_SMA60',   std: null,                  variance: null                    },
  { key: 'z4_temp',   item: 'Zone4_Temperature', sma5: 'Zone4_Temp_SMA5',  sma60: 'Zone4_Temp_SMA60',  std: 'Zone4_Temp_StdDev',  variance: 'Zone4_Temp_Variance'  },
  { key: 'z4_co2',    item: 'Zone4_CO2',          sma5: 'Zone4_CO2_SMA5',   sma60: null,                 std: null,                  variance: null                    },
  { key: 'bld_power', item: 'Bld_TotalPower',     sma5: 'Bld_Power_SMA5',  sma60: 'Bld_Power_SMA60',   std: 'Bld_Power_StdDev',   variance: 'Bld_Power_Variance'   }
];

// ─── Statistical helpers ──────────────────────────────────────────────────
function arrayMean(arr) {
  if (!arr || arr.length === 0) return 0;
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function arrayStdDev(arr) {
  if (!arr || arr.length < 2) return 0;
  var m = arrayMean(arr);
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
  return Math.sqrt(s / arr.length);
}

function round2(v) { return Math.round(v * 100) / 100; }
function round1(v) { return Math.round(v * 10)  / 10;  }
function round0(v) { return Math.round(v); }

// ─── Circular buffer helpers ──────────────────────────────────────────────
function getBuffer(key) {
  var raw = cache.shared.get('edge_buf_' + key);
  if (raw === null) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function pushBuffer(key, value) {
  var buf = getBuffer(key);
  buf.push(value);
  if (buf.length > BUFFER_MAX) buf.shift();
  cache.shared.put('edge_buf_' + key, JSON.stringify(buf));
  return buf;
}

function tail(arr, n) {
  return arr.slice(-Math.min(n, arr.length));
}

// ─── Safe item read ───────────────────────────────────────────────────────
function readNum(name, def) {
  try {
    var ns = items.getItem(name).numericState;
    return (ns !== null && !isNaN(ns)) ? ns : def;
  } catch (e) { return def; }
}

// ─── Aggregation run ─────────────────────────────────────────────────────
function runAggregation() {
  var totalBufSize = 0;
  var totalMaxSize = 0;

  for (var i = 0; i < SENSORS.length; i++) {
    var s    = SENSORS[i];
    var val  = readNum(s.item, null);
    if (val === null) continue;

    var buf  = pushBuffer(s.key, val);
    totalBufSize += buf.length;
    totalMaxSize += BUFFER_MAX;

    // 5-min SMA
    var w5   = tail(buf, WINDOW_5);
    var sma5 = arrayMean(w5);
    if (s.sma5) items.getItem(s.sma5).postUpdate(round1(sma5));

    // 60-min SMA and StdDev
    var sma60 = arrayMean(buf);
    var std   = arrayStdDev(buf);
    if (s.sma60) items.getItem(s.sma60).postUpdate(round1(sma60));
    if (s.std && buf.length >= 2) items.getItem(s.std).postUpdate(round2(std));
    if (s.variance && buf.length >= 2) items.getItem(s.variance).postUpdate(round2(std * std));

    // Publish full statistics to cache for downstream rules (JSON-serialized for thread safety)
    var stats = {
      buf:     buf,
      current: val,
      mean:    sma60,
      std:     std,
      min:     Math.min.apply(null, buf),
      max:     Math.max.apply(null, buf),
      sma5:    sma5,
      sma60:   sma60
    };
    cache.shared.put('edge_stats_' + s.key, JSON.stringify(stats));
  }

  // Buffer utilization: how full is our rolling window?
  var utilization = totalMaxSize > 0
    ? Math.round((totalBufSize / totalMaxSize) * 100)
    : 0;
  items.getItem('Edge_BufferUtilization').postUpdate(utilization);

  // Compression ratio: we store 4 aggregate values instead of BUFFER_MAX raw readings
  // (mean, std, min, max represent the window vs BUFFER_MAX individual points)
  var compRatio = Math.round((1 - 4 / BUFFER_MAX) * 100);
  items.getItem('Edge_CompressionRatio').postUpdate(compRatio);

  // Last aggregation timestamp
  var now = new Date();
  var ts = now.getHours().toString().padStart(2, '0') + ':' +
           now.getMinutes().toString().padStart(2, '0') + ':' +
           now.getSeconds().toString().padStart(2, '0');
  items.getItem('Edge_LastAggregation').postUpdate(ts);
  items.getItem('Edge_Status').postUpdate('RUNNING');

  logger.debug('Aggregated ' + SENSORS.length + ' sensors, buffer ' + utilization + '% full');
}

// ─── Rules ────────────────────────────────────────────────────────────────
rules.JSRule({
  id:          'edge-aggregation-startup',
  name:        'Edge Aggregation – startup',
  description: 'Variant 5: Initialise edge buffers and publish first statistics on startup.',
  triggers:    [triggers.SystemStartlevelTrigger(100)],
  execute: function () {
    try { runAggregation(); } catch (e) {
      logger.error('Startup aggregation failed: ' + e);
      items.getItem('Edge_Status').postUpdate('ERROR');
    }
  }
});

rules.JSRule({
  id:          'edge-aggregation-cron',
  name:        'Edge Aggregation – every minute',
  description: 'Variant 5: Update circular buffers and recompute window statistics each minute.',
  triggers:    [triggers.GenericCronTrigger('25 * * * * ?')],
  execute: function () {
    try { runAggregation(); } catch (e) {
      logger.error('Aggregation failed: ' + e);
      items.getItem('Edge_Status').postUpdate('ERROR');
    }
  }
});
