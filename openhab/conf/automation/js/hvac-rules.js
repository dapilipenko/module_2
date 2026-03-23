'use strict';
// ============================================================
// Variant 4: Building Automation Analytics
// hvac-rules.js  – HVAC optimization
//
// Runs at second 5 of every minute (after building-simulation.js).
// Computes per-zone HVAC setpoints (with pre-conditioning and
// weather-responsive adjustment), decides operation mode, and
// calculates power consumption.
// ============================================================
const { items, log, rules, triggers } = require('openhab');
const logger = log('hvac-rules');

// ─── Zone metadata ────────────────────────────────────────────────────────
const ZONES = [
  { key: 'z1', name: 'Zone1', label: 'Office',     area: 120, comfortSp: 22.0 },
  { key: 'z2', name: 'Zone2', label: 'Conference',  area: 60,  comfortSp: 21.0 },
  { key: 'z3', name: 'Zone3', label: 'Lobby',       area: 80,  comfortSp: 20.0 },
  { key: 'z4', name: 'Zone4', label: 'Server Room', area: 30,  comfortSp: 20.0 }
];

// Power density constants
const HVAC_HEAT_COEFF  = 25;   // W per °C per m² (heating)
const HVAC_COOL_COEFF  = 30;   // W per °C per m² (cooling – slightly more due to refrigeration)
const HVAC_FAN_DENSITY = 3;    // W/m² (fan-only mode)
const HVAC_MAX_HEAT    = 55;   // W/m² (max heating density)
const HVAC_MAX_COOL    = 65;   // W/m² (max cooling density)

const LIGHTING_DENSITY = { z1: 10, z2: 12, z3: 8,  z4: 5   }; // W/m² when occupied
const EQUIP_DENSITY    = { z1: 15, z2: 5,  z3: 8,  z4: 180 }; // W/m² base load (servers high)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, d)      => { const f = Math.pow(10, d); return Math.round(v * f) / f; };
const frac  = v           => v - Math.floor(v);

// ─── Item helpers ─────────────────────────────────────────────────────────
function readNum(name, def) {
  try {
    const ns = items.getItem(name).numericState;
    return (ns !== null && !isNaN(ns)) ? ns : def;
  } catch (e) { return def; }
}

// ─── Occupancy schedule (mirrors building-simulation.js) ─────────────────
function dayOfYear(date) {
  return Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
}

function isZoneOccupied(key, date) {
  const h  = date.getHours() + date.getMinutes() / 60;
  const dow = date.getDay();
  const isWD  = dow >= 1 && dow <= 5;
  const isSat = dow === 6;

  switch (key) {
    case 'z1': return (isWD && h >= 8 && h <= 18.5) || (isSat && h >= 9 && h < 13);
    case 'z2':
      if (!isWD) return false;
      for (const [s, e] of [[9, 11], [11, 12], [13, 15], [15, 17]]) {
        if (h >= s && h < e) {
          return frac(Math.sin(s * 91.3 + dayOfYear(date) * 7.4) * 43758) > 0.25;
        }
      }
      return false;
    case 'z3': return (isWD && h >= 7 && h <= 19) || (isSat && h >= 9 && h < 13);
    case 'z4': return false; // equipment zone – occupancy irrelevant for setpoint
    default:   return false;
  }
}

function willOccupySoon(key, date, minutes) {
  return isZoneOccupied(key, new Date(date.getTime() + minutes * 60000));
}

// ─── Setpoint computation ─────────────────────────────────────────────────
// Incorporates: occupancy state, pre-conditioning (30 min look-ahead),
// and weather-responsive offset.
function computeSetpoint(zone, date, outdoorTemp) {
  const occupied       = isZoneOccupied(zone.key, date);
  const preconditioning = !occupied && willOccupySoon(zone.key, date, 30);

  if (zone.key === 'z4') {
    // Server room: always maintain cool target regardless of occupancy
    return 20.0;
  }

  let sp;

  if (occupied || preconditioning) {
    sp = zone.comfortSp;

    // Weather-responsive fine-tuning
    if (outdoorTemp < 0) {
      sp += 0.5;  // compensate for cold draughts near entrance/windows
    } else if (outdoorTemp > 32) {
      sp += 0.5;  // relax setpoint slightly to reduce peak cooling load
    }
  } else {
    // Economy (setback) mode
    sp = outdoorTemp < 10
      ? 16.0                      // frost-protection heating setpoint
      : zone.comfortSp + 4.0;    // passive cooling tolerance
  }

  return round(clamp(sp, 14, 28), 1);
}

// ─── Mode decision ────────────────────────────────────────────────────────
function computeMode(key, currentTemp, setpoint) {
  const err = setpoint - currentTemp;

  if (key === 'z4') {
    // Server room never heats; always keeps air moving
    if (currentTemp > setpoint + 0.5) return 'COOL';
    return 'FAN';
  }

  if (err > 0.5)            return 'HEAT';
  if (err < -0.5)           return 'COOL';
  if (Math.abs(err) <= 0.3) return 'OFF';
  return 'FAN';
}

// ─── HVAC power calculation ───────────────────────────────────────────────
function computeHvacPower(zone, mode, currentTemp, setpoint) {
  const area = zone.area;
  const delta = Math.abs(setpoint - currentTemp);

  switch (mode) {
    case 'HEAT': return clamp(delta * area * HVAC_HEAT_COEFF, 0, area * HVAC_MAX_HEAT);
    case 'COOL': return clamp(delta * area * HVAC_COOL_COEFF, 0, area * HVAC_MAX_COOL);
    case 'FAN':  return area * HVAC_FAN_DENSITY;
    default:     return 0;
  }
}

// ─── Lighting power ───────────────────────────────────────────────────────
function computeLighting(zone, occupancy) {
  return occupancy > 0 ? zone.area * LIGHTING_DENSITY[zone.key] : 0;
}

// ─── Equipment power (base load – servers on 24/7) ───────────────────────
function computeEquipment(zone) {
  return zone.area * EQUIP_DENSITY[zone.key];
}

// ─── Main run ─────────────────────────────────────────────────────────────
function run() {
  try {
    const now        = new Date();
    const outdoorT   = readNum('Bld_OutdoorTemp', 10);

    let sumHvac = 0, sumLight = 0, sumEquip = 0;

    for (const zone of ZONES) {
      const currentTemp = readNum(zone.name + '_Temperature', zone.comfortSp);
      const occupancy   = readNum(zone.name + '_OccupancyCount', 0);

      const setpoint  = computeSetpoint(zone, now, outdoorT);
      const mode      = computeMode(zone.key, currentTemp, setpoint);
      const hvacPwr   = computeHvacPower(zone, mode, currentTemp, setpoint);
      const lightPwr  = computeLighting(zone, occupancy);
      const equipPwr  = computeEquipment(zone);

      items.getItem(zone.name + '_HVAC_Setpoint').postUpdate(setpoint.toFixed(1) + ' °C');
      items.getItem(zone.name + '_HVAC_Mode').postUpdate(mode);
      items.getItem(zone.name + '_HVAC_Power').postUpdate(Math.round(hvacPwr) + ' W');
      items.getItem(zone.name + '_Lighting_Power').postUpdate(Math.round(lightPwr) + ' W');
      items.getItem(zone.name + '_Equip_Power').postUpdate(Math.round(equipPwr) + ' W');

      sumHvac  += hvacPwr;
      sumLight += lightPwr;
      sumEquip += equipPwr;
    }

    const total = sumHvac + sumLight + sumEquip;
    items.getItem('Bld_TotalHVAC_Power').postUpdate(Math.round(sumHvac)  + ' W');
    items.getItem('Bld_TotalLight_Power').postUpdate(Math.round(sumLight) + ' W');
    items.getItem('Bld_TotalEquip_Power').postUpdate(Math.round(sumEquip) + ' W');
    items.getItem('Bld_TotalPower').postUpdate(Math.round(total) + ' W');

    logger.debug('HVAC run complete. Total: ' + Math.round(total) + ' W  (HVAC=' +
                 Math.round(sumHvac) + ' Lighting=' + Math.round(sumLight) +
                 ' Equip=' + Math.round(sumEquip) + ')');
  } catch (err) {
    logger.error('HVAC rules failed: ' + err);
  }
}

// ─── Rules ────────────────────────────────────────────────────────────────
rules.JSRule({
  id: 'hvac-rules-startup',
  name: 'HVAC rules startup',
  description: 'Compute initial HVAC state on system startup.',
  triggers: [triggers.SystemStartlevelTrigger(100)],
  execute: function () { run(); }
});

rules.JSRule({
  id: 'hvac-rules-minute',
  name: 'HVAC rules – every minute',
  description: 'Optimise HVAC setpoints and modes every minute (runs 5 s after simulation).',
  triggers: [triggers.GenericCronTrigger('5 * * * * ?')],
  execute: function () { run(); }
});

rules.JSRule({
  id: 'hvac-rules-reactive',
  name: 'HVAC rules – reactive',
  description: 'React immediately when Office temperature changes.',
  triggers: [triggers.ItemStateUpdateTrigger('Zone1_Temperature')],
  execute: function () { run(); }
});
