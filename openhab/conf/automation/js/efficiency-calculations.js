'use strict';
// ============================================================
// Variant 4: Building Automation Analytics
// efficiency-calculations.js  – PMV comfort + energy metrics
//                               + occupancy analytics
//
// Runs at second 15 of every minute (after hvac-rules.js).
// ============================================================
const { items, log, rules, triggers } = require('openhab');
const logger = log('efficiency-calculations');

// ─── Building constants ───────────────────────────────────────────────────
const TOTAL_AREA    = 290;  // m²
const BENCHMARK_EUI = 220;  // kWh/m²/yr – typical mixed office with data centre
const TARGET_EUI    = 150;  // kWh/m²/yr – energy-star-class target

const ZONES = [
  { key: 'z1', name: 'Zone1', label: 'Office',     area: 120 },
  { key: 'z2', name: 'Zone2', label: 'Conference',  area: 60  },
  { key: 'z3', name: 'Zone3', label: 'Lobby',       area: 80  },
  { key: 'z4', name: 'Zone4', label: 'Server Room', area: 30  }
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, d)      => { const f = Math.pow(10, d); return Math.round(v * f) / f; };

// ─── Item helpers ─────────────────────────────────────────────────────────
function readNum(name, def) {
  try {
    const ns = items.getItem(name).numericState;
    return (ns !== null && !isNaN(ns)) ? ns : def;
  } catch (e) { return def; }
}
function readStr(name, def) {
  try {
    const s = items.getItem(name).state;
    return (s && s !== 'NULL' && s !== 'UNDEF') ? s : def;
  } catch (e) { return def; }
}

// ─── PMV – ISO 7730 Fanger model ─────────────────────────────────────────
// ta  : air temperature [°C]        rh  : relative humidity [%]
// icl : clothing insulation [clo]   mmet: metabolic rate [met]
// v   : air velocity [m/s]          tr  : mean radiant temp [°C] (≈ ta)
function computePMV(ta, rh, icl, mmet, v) {
  if (!isFinite(ta) || !isFinite(rh)) {
    return 0;
  }
  icl  = icl  || 1.0;   // 1.0 clo – winter office
  mmet = mmet || 1.2;   // 1.2 met – sedentary/light office work
  v    = v    || 0.1;   // 0.1 m/s – near-still indoor air
  const tr = ta;         // mean radiant ≈ air temp for interior zones

  const M  = mmet * 58.15;   // metabolic rate [W/m²]
  const W  = 0;              // no external mechanical work

  // Partial vapour pressure [Pa]
  const pa = rh / 100 * Math.exp(16.6536 - 4030.18 / (ta + 235)) * 1000;

  // Clothing surface area factor
  const fcl = icl <= 0.5 ? 1.05 + 0.1 * icl : 1.0 + 0.2 * icl;

  // Iterative clothing surface temperature (ISO 7730 Annex A)
  let tcl = ta + (35.5 - ta) / (3.5 * (6.45 * icl + 0.1));
  for (let i = 0; i < 20; i++) {
    const hc = Math.max(2.38 * Math.pow(Math.abs(tcl - ta), 0.25), 12.1 * Math.sqrt(v));
    const tclNew = 35.7 - 0.0275 * (M - W)
      - icl * (3.96e-8 * fcl * (Math.pow(tcl + 273, 4) - Math.pow(tr + 273, 4))
             + fcl * hc * (tcl - ta));
    if (Math.abs(tclNew - tcl) < 0.001) { tcl = tclNew; break; }
    tcl = tclNew;
  }

  const hc = Math.max(2.38 * Math.pow(Math.abs(tcl - ta), 0.25), 12.1 * Math.sqrt(v));

  // Thermal load L [W/m²]
  const L = (M - W)
    - 3.05e-3 * (5733 - 6.99 * (M - W) - pa)
    - 0.42    * ((M - W) - 58.15)
    - 1.7e-5  * M * (5867 - pa)
    - 0.0014  * M * (34 - ta)
    - 3.96e-8 * fcl * (Math.pow(tcl + 273, 4) - Math.pow(tr + 273, 4))
    - fcl * hc * (tcl - ta);

  const pmv = (0.303 * Math.exp(-0.036 * M) + 0.028) * L;
  if (!isFinite(pmv)) {
    return 0;
  }
  return clamp(round(pmv, 2), -3, 3);
}

// PMV → comfort index (0–100 %)
// 100 % at PMV=0, 0 % at |PMV|=3, smooth power-law decay
function pmvToComfort(pmv) {
  if (!isFinite(pmv)) {
    return 0;
  }
  return clamp(Math.round(100 * (1 - Math.pow(Math.abs(pmv) / 3, 1.2))), 0, 100);
}

// Humidity comfort: ASHRAE 55 optimal range 30–60 % RH
function humidityComfort(rh) {
  if (!isFinite(rh)) {
    return 0;
  }
  if (rh >= 30 && rh <= 60) return 100;
  if (rh < 30) return clamp(Math.round(100 - (30 - rh) * 4), 0, 100);
  return clamp(Math.round(100 - (rh - 60) * 3), 0, 100);
}

// ─── Energy accumulator (resets at midnight) ──────────────────────────────
const energy = { kWh: 0, lastDay: -1, lastMin: -1 };

function accumulateEnergy(totalW) {
  const now   = new Date();
  const today = now.getDate();
  const min   = Math.floor(now.getTime() / 60000);

  if (today !== energy.lastDay) { energy.kWh = 0; energy.lastDay = today; }
  if (min !== energy.lastMin) {
    energy.kWh  += totalW / 1000 / 60;  // kWh consumed in one minute
    energy.lastMin = min;
  }
  return energy.kWh;
}

// EUI: annualise current instantaneous power over total floor area
function computeEUI(totalW) { return round(totalW / TOTAL_AREA * 8.76, 1); }

// Efficiency score 0–100: 100 at EUI ≤ 100, 0 at EUI ≥ 400
function efficiencyScore(eui) { return clamp(Math.round(100 - (eui - 100) / 3), 0, 100); }

function efficiencyRating(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'E';
}

// ─── Improvement suggestion generator ────────────────────────────────────
function improvementSuggestion(eui, hvacShare, serverShare) {
  if (serverShare > 55) return 'Server virtualisation could cut >20 % of base load';
  if (hvacShare   > 40) return 'Improve insulation and HVAC scheduling to reduce load';
  if (eui > 350)        return 'Energy far above target – comprehensive audit recommended';
  if (eui > 250)        return 'Consider LED upgrade and smart occupancy-based HVAC';
  for (const z of ZONES) {
    const occ  = readNum(z.name + '_OccupancyCount', 0);
    const mode = readStr(z.name + '_HVAC_Mode', 'OFF');
    if (occ === 0 && (mode === 'HEAT' || mode === 'COOL')) {
      return z.label + ' zone HVAC active while unoccupied – check schedule';
    }
  }
  return eui <= TARGET_EUI
    ? 'Building meets energy efficiency target – maintain current strategy'
    : 'Good performance – minor gains possible with occupancy-linked setbacks';
}

// ─── Occupancy analytics ──────────────────────────────────────────────────
// Rolling 60-minute sample buffer for peak detection and trend analysis
const occBuf = { samples: [], peakCount: 0, peakTimeStr: '--:--' };

function analyzeOccupancy(total, now) {
  // Append sample and prune to 60-minute window
  occBuf.samples.push({ t: now.getTime(), count: total });
  const cutoff = now.getTime() - 60 * 60000;
  occBuf.samples = occBuf.samples.filter(s => s.t >= cutoff);

  // Rolling peak
  for (const s of occBuf.samples) {
    if (s.count > occBuf.peakCount) {
      occBuf.peakCount = s.count;
      const d = new Date(s.t);
      occBuf.peakTimeStr =
        d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
    }
  }

  // 60-minute ahead prediction (time-pattern based)
  const futureDate = new Date(now.getTime() + 60 * 60000);
  const fh  = futureDate.getHours() + futureDate.getMinutes() / 60;
  const dow = futureDate.getDay();
  const isWD = dow >= 1 && dow <= 5;
  let prediction = 0;
  if (isWD && fh >= 9  && fh <= 17) prediction = Math.round(30 + 10 * Math.sin((fh - 9)  * Math.PI / 8));
  else if (isWD && fh >= 8 && fh < 9) prediction = Math.round(15 * (fh - 8));
  else if (isWD && fh > 17 && fh <= 18.5) prediction = Math.round(25 * (18.5 - fh));

  // Trend: rate of change over last 15 minutes (persons/hour)
  let trend = 0;
  if (occBuf.samples.length >= 15) {
    const early = occBuf.samples.slice(-15, -10);
    const late  = occBuf.samples.slice(-5);
    const avgE  = early.reduce((s, x) => s + x.count, 0) / early.length;
    const avgL  = late.reduce((s, x)  => s + x.count, 0) / late.length;
    trend = round((avgL - avgE) / 15 * 60, 1);
  }

  // Active zones and usage pattern string
  let activeZones = 0;
  const patternParts = [];
  for (const z of ZONES) {
    const occ = readNum(z.name + '_OccupancyCount', 0);
    if (occ > 0) { activeZones++; patternParts.push(z.label + ':' + occ); }
  }
  const zonePattern = patternParts.length > 0 ? patternParts.join(', ') : 'Building unoccupied';

  // Occupancy band label
  const status = total === 0 ? 'UNOCCUPIED'
               : total <= 15 ? 'LOW'
               : total <= 40 ? 'MODERATE'
               : total <= 70 ? 'HIGH'
               : 'PEAK';

  return { prediction, trend, activeZones, zonePattern, status };
}

// ─── Main run ─────────────────────────────────────────────────────────────
function run() {
  try {
    const now   = new Date();
    const month = now.getMonth();            // 0-11
    const icl   = (month >= 4 && month <= 9) ? 0.5 : 1.0; // summer/winter clothing

    // ── Per-zone comfort calculations ─────────────────────────────────────
    let weightedComfort = 0;
    let occupiedArea    = 0;
    let totalOccupancy  = 0;
    let sumHumidity     = 0;

    for (const zone of ZONES) {
      const temp     = readNum(zone.name + '_Temperature',    zone.key === 'z4' ? 22 : 22);
      const rh       = readNum(zone.name + '_Humidity',       50);
      const occupancy = readNum(zone.name + '_OccupancyCount', 0);
      const setpoint = readNum(zone.name + '_HVAC_Setpoint',  zone.key === 'z4' ? 20 : 22);

      // Server room: technicians in warm environment, light clothing
      const zoneIcl  = zone.key === 'z4' ? 0.7 : icl;
      const zoneMmet = zone.key === 'z4' ? 1.6  : 1.2;

      const pmv        = computePMV(temp, rh, zoneIcl, zoneMmet);
      const comfort    = pmvToComfort(pmv);
      const tempDev    = round(temp - setpoint, 1);

      items.getItem(zone.name + '_PMV').postUpdate(pmv.toFixed(2));
      items.getItem(zone.name + '_ComfortIndex').postUpdate(comfort);
      items.getItem(zone.name + '_TempDeviation').postUpdate(tempDev.toFixed(1));

      if (occupancy > 0) {
        weightedComfort += comfort * zone.area;
        occupiedArea    += zone.area;
      }
      totalOccupancy += occupancy;
      sumHumidity    += rh;
    }

    const avgRH           = sumHumidity / ZONES.length;
    const humComfort      = humidityComfort(avgRH);
    const zoneComfortAvg  = occupiedArea > 0
      ? Math.round(weightedComfort / occupiedArea)
      : 75; // default when building unoccupied
    const overallComfort  = Math.round(zoneComfortAvg * 0.8 + humComfort * 0.2);

    const comfortLevel = overallComfort >= 85 ? 'EXCELLENT'
                       : overallComfort >= 70 ? 'GOOD'
                       : overallComfort >= 55 ? 'ACCEPTABLE'
                       : overallComfort >= 40 ? 'POOR'
                       : 'UNACCEPTABLE';

    items.getItem('Bld_ComfortScore').postUpdate(overallComfort);
    items.getItem('Bld_ComfortLevel').postUpdate(comfortLevel);
    items.getItem('Bld_HumidityComfort').postUpdate(humComfort);

    // ── Energy metrics ────────────────────────────────────────────────────
    const totalW    = readNum('Bld_TotalPower',       0);
    const hvacW     = readNum('Bld_TotalHVAC_Power',  0);
    const serverW   = readNum('Zone4_Equip_Power',    0);

    const totalKwh  = accumulateEnergy(totalW);
    const eui       = computeEUI(totalW);
    const kwhPerm2  = round(totalKwh / TOTAL_AREA, 4);
    const effScore  = efficiencyScore(eui);
    const effRating = efficiencyRating(effScore);
    const hvacShare   = totalW > 0 ? round(hvacW  / totalW * 100, 1) : 0;
    const serverShare = totalW > 0 ? round(serverW / totalW * 100, 1) : 0;
    const suggestion  = improvementSuggestion(eui, hvacShare, serverShare);

    items.getItem('Bld_TotalEnergy_kWh').postUpdate(round(totalKwh, 3));
    items.getItem('Bld_EUI').postUpdate(eui.toFixed(1));
    items.getItem('Bld_kWhPerM2').postUpdate(kwhPerm2.toFixed(4));
    items.getItem('Bld_EfficiencyScore').postUpdate(effScore);
    items.getItem('Bld_BenchmarkEUI').postUpdate(BENCHMARK_EUI);
    items.getItem('Bld_EfficiencyRating').postUpdate(effRating);
    items.getItem('Bld_Suggestion').postUpdate(suggestion);
    items.getItem('Bld_HVAC_Share').postUpdate(hvacShare.toFixed(1));
    items.getItem('Bld_Server_Share').postUpdate(serverShare.toFixed(1));

    // ── Occupancy analytics ───────────────────────────────────────────────
    items.getItem('Bld_TotalOccupancy').postUpdate(totalOccupancy);

    const occ = analyzeOccupancy(totalOccupancy, now);
    items.getItem('Bld_OccupancyStatus').postUpdate(occ.status);
    items.getItem('Bld_OccupancyPred').postUpdate(occ.prediction);
    items.getItem('Bld_PeakTime').postUpdate(occBuf.peakTimeStr);
    items.getItem('Bld_PeakOccupancy').postUpdate(occBuf.peakCount);
    items.getItem('Bld_OccupancyTrend').postUpdate(occ.trend.toFixed(1));
    items.getItem('Bld_ActiveZones').postUpdate(occ.activeZones);
    items.getItem('Bld_ZonePattern').postUpdate(occ.zonePattern);

    logger.debug('Efficiency: EUI=' + eui + ' kWh/m²/yr  Score=' + effScore +
                 '%  Comfort=' + overallComfort + '%  Occupancy=' + totalOccupancy);
  } catch (err) {
    logger.error('Efficiency calculations failed: ' + err);
  }
}

// ─── Rules ────────────────────────────────────────────────────────────────
rules.JSRule({
  id: 'efficiency-startup',
  name: 'Efficiency calculations startup',
  description: 'Initialise efficiency and comfort metrics on startup.',
  triggers: [triggers.SystemStartlevelTrigger(100)],
  execute: function () { run(); }
});

rules.JSRule({
  id: 'efficiency-minute',
  name: 'Efficiency calculations – every minute',
  description: 'Compute PMV comfort, energy metrics, and occupancy analytics every minute.',
  triggers: [triggers.GenericCronTrigger('15 * * * * ?')],
  execute: function () { run(); }
});

rules.JSRule({
  id: 'efficiency-on-power',
  name: 'Efficiency – on total power update',
  description: 'React to power changes for near-real-time energy tracking.',
  triggers: [triggers.ItemStateUpdateTrigger('Bld_TotalPower')],
  execute: function () { run(); }
});
