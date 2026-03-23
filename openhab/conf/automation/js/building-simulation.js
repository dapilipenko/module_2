'use strict';
// ============================================================
// Variant 4: Building Automation Analytics
// building-simulation.js  – Zone sensor simulation
//
// Runs at second 0 of every minute.
// Applies a thermal model to 4 building zones using outdoor
// conditions, occupancy schedules, and HVAC feedback from the
// previous cycle (read from OpenHAB items).
// ============================================================
const { items, log, rules, triggers } = require('openhab');
const logger = log('building-simulation');

// ─── Building constants ───────────────────────────────────────────────────
const ZONES = [
  { key: 'z1', name: 'Zone1', area: 120, defaultSp: 22, initTemp: 21.0, initHum: 50, initCO2: 450 },
  { key: 'z2', name: 'Zone2', area: 60,  defaultSp: 21, initTemp: 20.5, initHum: 48, initCO2: 430 },
  { key: 'z3', name: 'Zone3', area: 80,  defaultSp: 20, initTemp: 19.5, initHum: 55, initCO2: 440 },
  { key: 'z4', name: 'Zone4', area: 30,  defaultSp: 20, initTemp: 23.0, initHum: 40, initCO2: 450 }
];

// Thermal model (per-minute rates)
const THERMAL_DRIFT   = 0.008;  // fraction per minute toward outdoor temp (well-insulated)
const HVAC_HEAT_RATE  = 0.15;   // fraction per minute toward setpoint when heating
const HVAC_COOL_RATE  = 0.12;   // fraction per minute toward setpoint when cooling
const HVAC_FAN_RATE   = 0.02;   // gentle equalisation during fan-only mode
const OCC_HEAT_RATE   = 0.04;   // °C per person per minute (body heat gain)

const WARMUP_MIN = 90;          // pre-simulation minutes before first publish

// ─── In-memory state ──────────────────────────────────────────────────────
const state = {
  temps:      { z1: 21.0, z2: 20.5, z3: 19.5, z4: 23.0 },
  humidity:   { z1: 50.0, z2: 48.0, z3: 55.0, z4: 40.0 },
  co2:        { z1: 450,  z2: 430,  z3: 440,  z4: 450  },
  lastMinute: null
};

// ─── Utility functions ────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, d) => { const f = Math.pow(10, d); return Math.round(v * f) / f; };
const frac  = v => v - Math.floor(v);
const noise = (step, seed) => frac(Math.sin(step * 12.9898 + seed * 78.233) * 43758.5453) * 2 - 1;
const gauss = (x, mu, s)  => Math.exp(-0.5 * Math.pow((x - mu) / s, 2));

function minuteIndex(date) { return Math.floor(date.getTime() / 60000); }
function dayOfYear(date) {
  return Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
}

// ─── Outdoor conditions ───────────────────────────────────────────────────
// Deterministic: seasonal + diurnal cycle with light noise
function outdoorConditions(date) {
  const idx      = minuteIndex(date);
  const day      = dayOfYear(date);
  const h        = date.getHours() + date.getMinutes() / 60;
  const seasonal = Math.sin(2 * Math.PI * (day - 80) / 365); // +1 = summer, -1 = winter

  const temp = clamp(
    10 + 11 * seasonal + 5 * Math.sin(2 * Math.PI * (h - 14) / 24) + 0.8 * noise(idx, 3),
    -15, 38
  );
  const humidity = clamp(72 - 1.2 * (temp - 14) + 2 * noise(idx, 7), 25, 98);

  return { temp: round(temp, 1), humidity: round(humidity, 1) };
}

// ─── Occupancy schedule ───────────────────────────────────────────────────
// Returns { z1, z2, z3, z4 } occupancy counts based on time-of-day + day-of-week
function scheduleOccupancy(date) {
  const h        = date.getHours() + date.getMinutes() / 60;
  const idx      = minuteIndex(date);
  const dow      = date.getDay(); // 0 = Sun, 6 = Sat
  const isWD     = dow >= 1 && dow <= 5;
  const isSat    = dow === 6;

  let z1 = 0, z2 = 0, z3 = 0, z4 = 0;

  if (isWD) {
    // Office (Zone 1): arrive 8-9 h, full day with lunch dip, leave 17-18:30 h
    if (h >= 8 && h <= 18.5) {
      const profile =
        40 * gauss(h,  8.6, 0.45) +  // morning arrival wave
        38 * gauss(h, 13.0, 3.2)  +  // broad mid-day occupancy
        -8 * gauss(h, 12.5, 0.4);    // lunch-hour dip
      z1 = clamp(Math.round(profile + 3 * noise(idx, 17)), 0, 40);
    }

    // Conference (Zone 2): fixed meeting blocks with 75 % probability each
    const meetings = [[9, 11], [11, 12], [13, 15], [15, 17]];
    for (const [s, e] of meetings) {
      if (h >= s && h < e) {
        const slotHash = frac(Math.sin(s * 91.3 + dayOfYear(date) * 7.4) * 43758);
        if (slotHash > 0.25) { // ~75 % of slots scheduled
          z2 = clamp(Math.round(12 + 8 * gauss(h, (s + e) / 2, (e - s) / 3) + 2 * noise(idx, 29)), 0, 20);
        }
        break;
      }
    }

    // Lobby (Zone 3): building hours 7-19 h, peaks at arrival/lunch/departure
    if (h >= 7 && h <= 19) {
      const profile =
        25 * gauss(h,  8.5, 0.65) +   // morning arrival
        12 * gauss(h, 12.5, 0.9)  +   // lunch traffic
        22 * gauss(h, 17.5, 0.75);    // evening departure
      z3 = clamp(Math.round(5 + profile + 3 * noise(idx, 41)), 0, 30);
    }
  } else if (isSat) {
    if (h >= 9 && h < 13) {
      z1 = clamp(Math.round(8 + 4 * noise(idx, 53)), 0, 15);
      z3 = clamp(Math.round(3 + 2 * noise(idx, 61)), 0, 8);
    }
  }

  // Server room (Zone 4): occasional technician visit (~1/hour on weekdays)
  const visitHash = frac(Math.sin(idx * 19.7 + 42.1) * 43758);
  const visitChance = isWD ? (1 / 60) : (1 / 240);
  z4 = visitHash < visitChance * 15 ? 1 : 0;

  return { z1, z2, z3, z4 };
}

// ─── HVAC state reader (reads from items; defaults used on first run) ────
function readHvacState(zone) {
  try {
    const modeItem = items.getItem(zone.name + '_HVAC_Mode');
    const spItem   = items.getItem(zone.name + '_HVAC_Setpoint');
    const mode = (modeItem.state && modeItem.state !== 'NULL' && modeItem.state !== 'UNDEF')
      ? modeItem.state : 'OFF';
    const sp   = (spItem.numericState !== null && !isNaN(spItem.numericState))
      ? spItem.numericState : zone.defaultSp;
    return { mode, setpoint: sp };
  } catch (e) {
    return { mode: 'OFF', setpoint: zone.defaultSp };
  }
}

// ─── Thermal model for one zone (one-minute step) ────────────────────────
function stepTemp(zone, current, outdoor, occupancy, hvac, idx) {
  const seeds = { z1: 101, z2: 113, z3: 127, z4: 139 };
  const drift  = (outdoor - current) * THERMAL_DRIFT;
  const occGain = occupancy * OCC_HEAT_RATE;

  let hvacCorr = 0;
  const err = hvac.setpoint - current;
  if      (hvac.mode === 'HEAT') hvacCorr = err * HVAC_HEAT_RATE;
  else if (hvac.mode === 'COOL') hvacCorr = err * HVAC_COOL_RATE;
  else if (hvac.mode === 'FAN')  hvacCorr = err * HVAC_FAN_RATE;

  const n = 0.12 * noise(idx, seeds[zone.key]);
  return clamp(current + drift + hvacCorr + occGain + n, 10, 42);
}

// ─── Humidity model ───────────────────────────────────────────────────────
function stepHumidity(zone, current, outdoorHum, temp, occupancy, idx) {
  const seeds = { z1: 201, z2: 211, z3: 223, z4: 233 };
  const drift   = (outdoorHum - current) * 0.006;
  const tempFx  = (22 - temp) * 0.07;   // higher temp → lower RH
  const occFx   = occupancy * 0.03;     // breathing adds moisture
  const n = 0.4 * noise(idx, seeds[zone.key]);
  return clamp(current + drift + tempFx + occFx + n, 20, 90);
}

// ─── CO2 model ────────────────────────────────────────────────────────────
function stepCO2(zone, current, occupancy, hvacMode, idx) {
  const seeds = { z1: 301, z2: 311, z3: 323, z4: 333 };
  const genRate  = occupancy * (450 / zone.area);    // ppm per person
  const ventRate = hvacMode === 'OFF' ? 0.005        // infiltration only
                 : hvacMode === 'FAN' ? 0.022        // good ventilation
                 : 0.016;                             // HEAT/COOL with recirculation
  const removed = (current - 420) * ventRate;
  const n = 5 * noise(idx, seeds[zone.key]);
  return clamp(current + genRate - removed + n, 400, 2000);
}

// ─── Inline HVAC for warmup (no item I/O) ────────────────────────────────
function warmupHvac(zone, temp, occupancy) {
  const sp = zone.defaultSp;
  if (zone.key === 'z4') {
    return { mode: temp > sp + 0.5 ? 'COOL' : 'FAN', setpoint: sp };
  }
  const economy = temp > 14 ? sp + 4.0 : 16.0;
  const target  = occupancy > 0 ? sp : economy;
  const mode = temp < target - 0.5 ? 'HEAT'
             : temp > target + 0.5 ? 'COOL'
             : occupancy > 0 ? 'FAN' : 'OFF';
  return { mode, setpoint: target };
}

// ─── Warmup: pre-simulate WARMUP_MIN minutes to reach steady state ────────
function warmup() {
  const now    = new Date();
  const start  = new Date(now.getTime() - WARMUP_MIN * 60000);
  const initOd = outdoorConditions(start);

  // Bootstrap temperatures from outdoor ambient + insulation offset
  for (const z of ZONES) {
    state.temps[z.key]    = round(initOd.temp + (z.key === 'z4' ? 5 : 3), 1);
    state.humidity[z.key] = z.initHum;
    state.co2[z.key]      = z.initCO2;
  }

  for (let m = WARMUP_MIN - 1; m >= 0; m--) {
    const t   = new Date(now.getTime() - m * 60000);
    const idx = minuteIndex(t);
    const od  = outdoorConditions(t);
    const occ = scheduleOccupancy(t);

    for (const z of ZONES) {
      const hvac = warmupHvac(z, state.temps[z.key], occ[z.key]);
      state.temps[z.key]    = round(stepTemp(z, state.temps[z.key], od.temp,    occ[z.key], hvac, idx), 1);
      state.humidity[z.key] = round(stepHumidity(z, state.humidity[z.key], od.humidity, state.temps[z.key], occ[z.key], idx), 1);
      state.co2[z.key]      = Math.round(stepCO2(z, state.co2[z.key], occ[z.key], hvac.mode, idx));
    }
  }

  state.lastMinute = minuteIndex(now);
  logger.info('Building warmup complete – Z1=' + state.temps.z1 + '°C  Z2=' + state.temps.z2 +
              '°C  Z3=' + state.temps.z3 + '°C  Z4=' + state.temps.z4 + '°C');
}

// ─── Publish: write all sensor readings to items ──────────────────────────
function publish(outdoor, occ) {
  items.getItem('Bld_OutdoorTemp').postUpdate(outdoor.temp.toFixed(1) + ' °C');
  items.getItem('Bld_OutdoorHumidity').postUpdate(outdoor.humidity.toFixed(1));

  for (const z of ZONES) {
    items.getItem(z.name + '_Temperature').postUpdate(state.temps[z.key].toFixed(1) + ' °C');
    items.getItem(z.name + '_Humidity').postUpdate(state.humidity[z.key].toFixed(1));
    items.getItem(z.name + '_CO2').postUpdate(state.co2[z.key]);
    items.getItem(z.name + '_OccupancyCount').postUpdate(occ[z.key]);
    items.getItem(z.name + '_Motion').postUpdate(occ[z.key] > 0 ? 'ON' : 'OFF');
  }

  items.getItem('Bld_SystemStatus').postUpdate('RUNNING');
}

// ─── Main simulation step ─────────────────────────────────────────────────
function run(startup) {
  try {
    if (startup || state.lastMinute === null) {
      warmup();
    }

    const now        = new Date();
    const currentMin = minuteIndex(now);
    const fromMin    = (state.lastMinute !== null) ? state.lastMinute + 1 : currentMin;

    // Catch up on any missed minutes (e.g., restart, daylight-saving)
    for (let m = fromMin; m <= currentMin; m++) {
      const t   = new Date(m * 60000);
      const idx = m;
      const od  = outdoorConditions(t);
      const occ = scheduleOccupancy(t);

      for (const z of ZONES) {
        const hvac = readHvacState(z);
        state.temps[z.key]    = round(stepTemp(z, state.temps[z.key], od.temp, occ[z.key], hvac, idx), 1);
        state.humidity[z.key] = round(stepHumidity(z, state.humidity[z.key], od.humidity, state.temps[z.key], occ[z.key], idx), 1);
        state.co2[z.key]      = Math.round(stepCO2(z, state.co2[z.key], occ[z.key], hvac.mode, idx));
      }
    }

    state.lastMinute = currentMin;

    const outdoor = outdoorConditions(now);
    const occ     = scheduleOccupancy(now);
    publish(outdoor, occ);
  } catch (err) {
    logger.error('Building simulation failed: ' + err);
  }
}

// ─── Rules ────────────────────────────────────────────────────────────────
rules.JSRule({
  id: 'building-sim-startup',
  name: 'Building simulation startup',
  description: 'Warm up and publish building sensor state on system startup.',
  triggers: [triggers.SystemStartlevelTrigger(100)],
  execute: function () { run(true); }
});

rules.JSRule({
  id: 'building-sim-minute',
  name: 'Building simulation – every minute',
  description: 'Advance building thermal model and update sensor items each minute.',
  triggers: [triggers.GenericCronTrigger('0 * * * * ?')],
  execute: function () { run(false); }
});
