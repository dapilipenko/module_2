'use strict';
// ============================================================
// Variant 5: Edge Analytics Node
// edge-simulation.js  –  Sensor Data Simulation
//
// Runs at second 00 of every minute (first step in pipeline).
// Generates realistic sensor data for the four-zone building:
//
//   • Zone 1–4 Temperature (°C)
//   • Zone 1–4 CO2 (ppm)
//   • Building total power (W)
//
// The simulation models:
//   – Diurnal temperature and CO2 cycles
//   – Occupancy-driven CO2 patterns (work hours vs nights)
//   – Server room constant cooling load
//   – Random noise for realistic variance
//   – Occasional anomaly injection (~2 % chance per sensor)
//
// All values are written to OpenHAB items which the downstream
// edge-aggregation.js → edge-analytics.js pipeline then processes.
// ============================================================
const { items, log, rules, triggers } = require('openhab');
const logger = log('edge-simulation');

// ─── Configuration ────────────────────────────────────────────────────────
var BASE_TEMPS     = { z1: 22.0, z2: 21.5, z3: 20.5, z4: 24.0 };
var BASE_CO2       = { z1: 450,  z2: 420,  z3: 380,  z4: 350  };
var BASE_POWER     = 45000;  // 45 kW baseline

// Anomaly injection probability per sensor per cycle (≈ 2 %)
var ANOMALY_PROB   = 0.02;

// ─── Helpers ──────────────────────────────────────────────────────────────
function gaussNoise(sigma) {
  // Box-Muller transform for Gaussian noise
  var u1 = Math.random();
  var u2 = Math.random();
  if (u1 < 1e-10) u1 = 1e-10;
  return sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp(val, lo, hi) {
  return Math.max(lo, Math.min(hi, val));
}

function hourFraction() {
  var now = new Date();
  return now.getHours() + now.getMinutes() / 60.0;
}

function isWeekday() {
  var day = new Date().getDay();
  return day >= 1 && day <= 5;
}

// ─── Occupancy model (0..1 scale) ─────────────────────────────────────────
function occupancyFactor(zone) {
  var h = hourFraction();
  var wd = isWeekday();

  if (!wd) {
    // Weekend: minimal occupancy
    if (zone === 'z4') return 0.05;  // rare server visit
    return 0.05 + 0.05 * Math.sin(Math.PI * (h - 10) / 8);
  }

  switch (zone) {
    case 'z1':  // Office: 8–18
      if (h < 7 || h > 19) return 0.05;
      if (h >= 8 && h <= 18) {
        var base = 0.7 + 0.3 * Math.sin(Math.PI * (h - 8) / 10);
        // lunch dip
        if (h >= 12 && h <= 13) base *= 0.6;
        return clamp(base, 0, 1);
      }
      return 0.2;

    case 'z2':  // Conference: meeting blocks
      if (h < 8 || h > 18) return 0.02;
      if ((h >= 9 && h < 11) || (h >= 14 && h < 16)) return 0.8 + 0.2 * Math.random();
      if (h >= 11 && h < 12) return 0.5;
      return 0.1;

    case 'z3':  // Lobby: peaks at arrival, lunch, departure
      if (h < 7 || h > 20) return 0.05;
      if ((h >= 8 && h < 9) || (h >= 12 && h < 13) || (h >= 17 && h < 18)) return 0.7 + 0.2 * Math.random();
      if (h >= 9 && h <= 17) return 0.3;
      return 0.1;

    case 'z4':  // Server room: minimal
      return 0.02 + (Math.random() < 0.1 ? 0.3 : 0);

    default: return 0.1;
  }
}

// ─── Temperature model ────────────────────────────────────────────────────
function simulateTemp(zone) {
  var base = BASE_TEMPS[zone];
  var h = hourFraction();

  // Diurnal cycle: warmer midday, cooler at night
  var diurnal = 1.5 * Math.sin(Math.PI * (h - 6) / 12);

  // Occupancy heat gain
  var occ = occupancyFactor(zone);
  var occHeat = occ * 2.0;  // up to +2°C at full occupancy

  // Server room: higher base, less diurnal variation
  if (zone === 'z4') {
    diurnal *= 0.3;
    occHeat = 0;  // servers generate constant heat
    base += 2.0 * Math.sin(Math.PI * h / 24);  // slow thermal drift
  }

  var noise = gaussNoise(0.3);
  var temp = base + diurnal + occHeat + noise;

  // Anomaly injection: sudden spike
  if (Math.random() < ANOMALY_PROB) {
    var spike = (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random() * 5);
    temp += spike;
    logger.debug(zone + ' temp anomaly injected: ' + spike.toFixed(1) + '°C');
  }

  return clamp(temp, 10, 40);
}

// ─── CO2 model ────────────────────────────────────────────────────────────
function simulateCO2(zone) {
  var base = BASE_CO2[zone];

  // CO2 correlates strongly with occupancy
  var occ = occupancyFactor(zone);
  var occCO2 = occ * 800;  // up to +800 ppm at full occupancy

  // Server room: minimal CO2 variation
  if (zone === 'z4') {
    occCO2 = occ * 100;
  }

  var noise = gaussNoise(25);
  var co2 = base + occCO2 + noise;

  // Anomaly injection: CO2 spike (ventilation failure)
  if (Math.random() < ANOMALY_PROB) {
    var spike = 500 + Math.random() * 1000;
    co2 += spike;
    logger.debug(zone + ' CO2 anomaly injected: +' + spike.toFixed(0) + ' ppm');
  }

  return clamp(co2, 300, 5000);
}

// ─── Power model ──────────────────────────────────────────────────────────
function simulatePower() {
  var h = hourFraction();
  var wd = isWeekday();

  // Base load (servers, standby)
  var power = BASE_POWER;

  // HVAC load: higher during work hours
  if (wd && h >= 7 && h <= 19) {
    power += 25000 + 15000 * Math.sin(Math.PI * (h - 7) / 12);
  } else {
    power += 8000;  // night/weekend HVAC
  }

  // Lighting and equipment
  var totalOcc = (occupancyFactor('z1') + occupancyFactor('z2') +
                  occupancyFactor('z3')) / 3;
  power += totalOcc * 20000;  // occupancy-driven equipment load

  // Server room constant load
  power += 5400;  // 180 W/m² × 30 m²

  var noise = gaussNoise(1500);
  power += noise;

  // Anomaly injection: power surge
  if (Math.random() < ANOMALY_PROB) {
    var surge = 30000 + Math.random() * 50000;
    power += surge;
    logger.debug('Power anomaly injected: +' + surge.toFixed(0) + ' W');
  }

  return clamp(power, 10000, 250000);
}

// ─── Safe item update ─────────────────────────────────────────────────────
function updateItem(name, value) {
  try {
    items.getItem(name).postUpdate(Math.round(value * 10) / 10);
  } catch (e) {
    logger.warn('Cannot update item ' + name + ': ' + e);
  }
}

// ─── Main simulation run ─────────────────────────────────────────────────
function runSimulation() {
  // Zone temperatures
  updateItem('Zone1_Temperature', simulateTemp('z1'));
  updateItem('Zone2_Temperature', simulateTemp('z2'));
  updateItem('Zone3_Temperature', simulateTemp('z3'));
  updateItem('Zone4_Temperature', simulateTemp('z4'));

  // Zone CO2
  updateItem('Zone1_CO2', simulateCO2('z1'));
  updateItem('Zone2_CO2', simulateCO2('z2'));
  updateItem('Zone3_CO2', simulateCO2('z3'));
  updateItem('Zone4_CO2', simulateCO2('z4'));

  // Building power
  updateItem('Bld_TotalPower', simulatePower());

  logger.debug('Simulation cycle complete');
}

// ─── Pre-warm: inject 60 historical readings on startup ───────────────────
function prewarm() {
  logger.info('Pre-warming 60 minutes of synthetic history…');
  for (var tick = 0; tick < 60; tick++) {
    runSimulation();
    // Small delay is not needed here since we just need item values populated.
    // Each call to runSimulation sets item states, and the aggregation
    // pipeline will pick them up on its own schedule.
  }
  logger.info('Pre-warm complete (60 ticks)');
}

// ─── Rules ────────────────────────────────────────────────────────────────
rules.JSRule({
  id:          'edge-simulation-startup',
  name:        'Edge Simulation – startup',
  description: 'Variant 5: Pre-warm sensor data with 60 ticks of synthetic history.',
  triggers:    [triggers.SystemStartlevelTrigger(100)],
  execute: function () {
    try { prewarm(); } catch (e) { logger.error('Pre-warm failed: ' + e); }
  }
});

rules.JSRule({
  id:          'edge-simulation-cron',
  name:        'Edge Simulation – every minute',
  description: 'Variant 5: Generate simulated sensor readings for all 9 data points.',
  triggers:    [triggers.GenericCronTrigger('0 * * * * ?')],
  execute: function () {
    try { runSimulation(); } catch (e) { logger.error('Simulation failed: ' + e); }
  }
});
