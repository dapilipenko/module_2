'use strict';
// ============================================================
// Variant 5: Edge Analytics Node
// edge-analytics.js  –  Statistical Processing
//
// Runs at second 30 of every minute (after edge-aggregation.js).
// Reads per-sensor statistics from the shared cache and computes:
//
//   EWMA  : Exponentially Weighted Moving Average (α = 0.1)
//           Tracks slow drift; large deviations flag anomalies.
//   Z-score: (current − mean) / σ
//           Measures how many standard deviations the reading
//           is from the rolling 60-min mean.
//   Pearson r: correlation between zone temperature and CO2.
//           r ≈ +1 → CO2 rises with temp (ventilation issue)
//           r ≈  0 → independent; r < 0 → inverse relationship
//
// Results are written to OpenHAB items and stored back in the
// shared cache for anomaly-detection.js to consume.
// ============================================================
const { items, log, rules, triggers } = require('openhab');
const logger = log('edge-analytics');

// ─── EWMA smoothing factor ────────────────────────────────────────────────
// α = 0.1 → heavy smoothing, tracks long-term trend
// New_EWMA = α × current + (1 − α) × previous_EWMA
const EWMA_ALPHA = 0.1;

// ─── Zone configuration ───────────────────────────────────────────────────
var ZONES = [
  { n: 1, tempKey: 'z1_temp', co2Key: 'z1_co2',
    ewmaItem: 'Zone1_Temp_EWMA', zScoreItem: 'Zone1_Temp_ZScore',
    co2ZItem: 'Zone1_CO2_ZScore', co2SMA60Item: 'Zone1_CO2_SMA60',
    corrItem: 'Zone1_TempCO2_Corr' },
  { n: 2, tempKey: 'z2_temp', co2Key: 'z2_co2',
    ewmaItem: 'Zone2_Temp_EWMA', zScoreItem: 'Zone2_Temp_ZScore',
    co2ZItem: 'Zone2_CO2_ZScore', co2SMA60Item: 'Zone2_CO2_SMA60',
    corrItem: 'Zone2_TempCO2_Corr' },
  { n: 3, tempKey: 'z3_temp', co2Key: 'z3_co2',
    ewmaItem: 'Zone3_Temp_EWMA', zScoreItem: 'Zone3_Temp_ZScore',
    co2ZItem: 'Zone3_CO2_ZScore', co2SMA60Item: 'Zone3_CO2_SMA60',
    corrItem: 'Zone3_TempCO2_Corr' },
  { n: 4, tempKey: 'z4_temp', co2Key: 'z4_co2',
    ewmaItem: 'Zone4_Temp_EWMA', zScoreItem: 'Zone4_Temp_ZScore',
    co2ZItem: 'Zone4_CO2_ZScore', co2SMA60Item: null,
    corrItem: 'Zone4_TempCO2_Corr' }
];

// ─── EWMA (stateful – persists per sensor key in shared cache) ────────────
function computeEWMA(key, current) {
  var prev = cache.shared.get('ewma_' + key);
  if (prev === null) prev = current;
  var updated = EWMA_ALPHA * current + (1 - EWMA_ALPHA) * prev;
  cache.shared.put('ewma_' + key, updated);
  return updated;
}

// ─── Pearson correlation ─────────────────────────────────────────────────
// Returns r ∈ [−1, +1]; requires at least 5 paired readings.
function pearson(xArr, yArr) {
  var n = Math.min(xArr.length, yArr.length);
  if (n < 5) return 0;
  var xs = xArr.slice(-n);
  var ys = yArr.slice(-n);
  var mx = 0, my = 0;
  for (var i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  var num = 0, dx2 = 0, dy2 = 0;
  for (var i = 0; i < n; i++) {
    var dxi = xs[i] - mx;
    var dyi = ys[i] - my;
    num += dxi * dyi;
    dx2 += dxi * dxi;
    dy2 += dyi * dyi;
  }
  var denom = Math.sqrt(dx2 * dy2);
  return denom > 0 ? num / denom : 0;
}

function round2(v) { return Math.round(v * 100) / 100; }
function round1(v) { return Math.round(v * 10)  / 10;  }

// ─── Main analytics run ───────────────────────────────────────────────────
function runAnalytics() {
  // Per-zone: temperature EWMA, Z-score, CO2 Z-score, Temp–CO2 correlation
  for (var i = 0; i < ZONES.length; i++) {
    var z = ZONES[i];

    var tStatsRaw = cache.shared.get('edge_stats_' + z.tempKey);
    if (tStatsRaw === null) continue;
    var tStats;
    try { tStats = JSON.parse(tStatsRaw); } catch (e) { continue; }

    // ── Temperature EWMA ──────────────────────────────────────────────────
    var ewmaVal = computeEWMA(z.tempKey, tStats.current);
    tStats.ewma = ewmaVal;
    items.getItem(z.ewmaItem).postUpdate(round1(ewmaVal));

    // ── Temperature Z-score ───────────────────────────────────────────────
    var tempZ = 0;
    if (tStats.std > 0 && tStats.buf.length >= 5) {
      tempZ = (tStats.current - tStats.mean) / tStats.std;
    }
    tStats.zscore = tempZ;
    items.getItem(z.zScoreItem).postUpdate(round2(tempZ));

    // Save updated temp stats back to cache (JSON-serialized for thread safety)
    cache.shared.put('edge_stats_' + z.tempKey, JSON.stringify(tStats));

    // ── CO2 Z-score ───────────────────────────────────────────────────────
    var cStatsRaw = cache.shared.get('edge_stats_' + z.co2Key);
    var cStats = null;
    if (cStatsRaw !== null) {
      try { cStats = JSON.parse(cStatsRaw); } catch (e) { cStats = null; }
    }
    if (cStats !== null && cStats.buf.length >= 5) {
      var co2Z = cStats.std > 0
        ? (cStats.current - cStats.mean) / cStats.std
        : 0;
      cStats.zscore = co2Z;
      items.getItem(z.co2ZItem).postUpdate(round2(co2Z));
      if (z.co2SMA60Item) items.getItem(z.co2SMA60Item).postUpdate(round1(cStats.mean));
      cache.shared.put('edge_stats_' + z.co2Key, JSON.stringify(cStats));
    }

    // ── Pearson correlation: Temp ↔ CO2 ──────────────────────────────────
    if (cStats !== null && tStats.buf.length >= 10 && cStats.buf.length >= 10) {
      var r = pearson(tStats.buf, cStats.buf);
      items.getItem(z.corrItem).postUpdate(round2(r));
    }
  }

  // Building power EWMA and Z-score
  var pStatsRaw = cache.shared.get('edge_stats_bld_power');
  var pStats = null;
  if (pStatsRaw !== null) {
    try { pStats = JSON.parse(pStatsRaw); } catch (e) { pStats = null; }
  }
  if (pStats !== null) {
    var pwrEWMA = computeEWMA('bld_power', pStats.current);
    pStats.ewma = pwrEWMA;
    items.getItem('Bld_Power_EWMA').postUpdate(Math.round(pwrEWMA));

    var pwrZ = (pStats.std > 0 && pStats.buf.length >= 5)
      ? (pStats.current - pStats.mean) / pStats.std
      : 0;
    pStats.zscore = pwrZ;
    items.getItem('Bld_Power_ZScore').postUpdate(round2(pwrZ));
    cache.shared.put('edge_stats_bld_power', JSON.stringify(pStats));
  }

  logger.debug('Statistical processing complete');
}

// ─── Rules ────────────────────────────────────────────────────────────────
rules.JSRule({
  id:          'edge-analytics-startup',
  name:        'Edge Analytics – startup',
  description: 'Variant 5: Initial statistical computation on system startup.',
  triggers:    [triggers.SystemStartlevelTrigger(100)],
  execute: function () {
    try { runAnalytics(); } catch (e) { logger.error('Startup analytics failed: ' + e); }
  }
});

rules.JSRule({
  id:          'edge-analytics-cron',
  name:        'Edge Analytics – statistical processing',
  description: 'Variant 5: Compute EWMA, Z-scores and Pearson correlations each minute.',
  triggers:    [triggers.GenericCronTrigger('30 * * * * ?')],
  execute: function () {
    try { runAnalytics(); } catch (e) { logger.error('Analytics failed: ' + e); }
  }
});
