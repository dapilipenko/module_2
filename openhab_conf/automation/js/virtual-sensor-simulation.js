'use strict';
const { items, log, rules, triggers } = require('openhab');
const logger = log('virtual-sensor-simulation');
const HISTORY = 240;
const WARMUP = 180;
const state = { history: makeHistory(), lastMinute: null };
function makeHistory() { return { outdoorTemperature: [], indoorTemperature: [], outdoorHumidity: [], indoorHumidity: [], barometricPressure: [], co2: [], daylight: [] }; }
const clamp = function (value, min, max) { return Math.max(min, Math.min(max, value)); };
const round = function (value, digits) { const factor = Math.pow(10, digits); return Math.round(value * factor) / factor; };
const frac = function (value) { return value - Math.floor(value); };
const noise = function (step, seed) { return frac(Math.sin(step * 12.9898 + seed * 78.233) * 43758.5453) * 2 - 1; };
const gauss = function (value, mean, sigma) { return Math.exp(-Math.pow(value - mean, 2) / (2 * sigma * sigma)); };
function minute(date) { const normalized = new Date(date.getTime()); normalized.setSeconds(0); normalized.setMilliseconds(0); return normalized; }
function minuteIndex(date) { return Math.floor(minute(date).getTime() / 60000); }
function dayOfYear(date) { const start = new Date(date.getFullYear(), 0, 0); return Math.floor((date.getTime() - start.getTime()) / 86400000); }
function lag(key, steps, fallback) { const series = state.history[key]; return steps > 0 && series.length >= steps ? series[series.length - steps] : fallback; }
function occupancy(date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  const isWeekday = date.getDay() >= 1 && date.getDay() <= 5;
  const weekday = 0.58 * gauss(hour, 7.5, 1.1) + 0.92 * gauss(hour, 18.8, 2.0) + 0.35 * gauss(hour, 12.4, 1.0);
  const weekend = 0.42 * gauss(hour, 10.8, 2.2) + 0.62 * gauss(hour, 20.1, 2.3);
  return clamp(0.05 + (isWeekday ? weekday : weekend), 0.05, 1.15);
}
function snapshot(date) {
  const index = minuteIndex(date);
  const day = dayOfYear(date);
  const minuteOfDay = date.getHours() * 60 + date.getMinutes();
  const hour = minuteOfDay / 60;
  const seasonal = Math.sin((2 * Math.PI * (day - 80)) / 365);
  const daylightHours = 8 + 4 * (seasonal + 1);
  const sunrise = 12 - daylightHours / 2;
  const sunset = 12 + daylightHours / 2;
  const normalized = hour >= sunrise && hour <= sunset ? (hour - sunrise) / daylightHours : -1;
  const solar = normalized >= 0 ? Math.sin(Math.PI * normalized) : 0;
  const cloud = clamp(0.45 + 0.25 * Math.sin((2 * Math.PI * index) / 480 + 0.8) + 0.15 * noise(index, 101), 0.05, 0.95);
  const daylight = clamp(85000 * solar * (1 - 0.65 * cloud), 0, 95000);
  const pressure = clamp(1014.5 + 4.0 * seasonal + 6.2 * Math.sin((2 * Math.PI * index) / 720 + 0.6) + 2.1 * Math.sin((2 * Math.PI * index) / 240 - 1.1) + 0.8 * noise(index, 205), 995, 1038);
  const outdoorTemperature = clamp(11 + 11.5 * seasonal + 5.4 * Math.sin((2 * Math.PI * (minuteOfDay - 240)) / 1440) - 0.24 * (pressure - 1014) + 1.3 * (daylight / 85000) + 0.9 * noise(index, 11), -18, 38);
  const outdoorHumidity = clamp(72 - 1.35 * (outdoorTemperature - 14) - 0.28 * (pressure - 1013) + cloud * 18 + 2.0 * noise(index, 23), 25, 98);
  const indoorTemperature = clamp(21.4 + 0.38 * (lag('outdoorTemperature', 25, outdoorTemperature - 0.8) - 12) + 0.9 * occupancy(date) - 0.25 * (cloud - 0.5) + 0.35 * noise(index, 37), 18.5, 29);
  const indoorHumidity = clamp(42 + 0.28 * (lag('outdoorHumidity', 12, outdoorHumidity - 1.5) - 55) - 0.65 * (indoorTemperature - 22) + 5.8 * occupancy(date) + 1.2 * noise(index, 53), 22, 78);
  const co2 = clamp(440 + 520 * occupancy(date) + 18 * Math.max(0, 22.5 - indoorTemperature) + 0.9 * (indoorHumidity - 45) - daylight / 3000 + 25 * noise(index, 71), 400, 1800);
  return { barometricPressure: round(pressure, 1), outdoorTemperature: round(outdoorTemperature, 1), indoorTemperature: round(indoorTemperature, 1), outdoorHumidity: round(outdoorHumidity, 1), indoorHumidity: round(indoorHumidity, 1), co2: Math.round(co2), daylight: Math.round(daylight) };
}
function push(key, value) { const series = state.history[key]; series.push(value); if (series.length > HISTORY) { series.shift(); } }
function remember(sample) { push('barometricPressure', sample.barometricPressure); push('outdoorTemperature', sample.outdoorTemperature); push('indoorTemperature', sample.indoorTemperature); push('outdoorHumidity', sample.outdoorHumidity); push('indoorHumidity', sample.indoorHumidity); push('co2', sample.co2); push('daylight', sample.daylight); }
function latest() {
  if (state.history.barometricPressure.length === 0) { return null; }
  return {
    barometricPressure: state.history.barometricPressure[state.history.barometricPressure.length - 1],
    outdoorTemperature: state.history.outdoorTemperature[state.history.outdoorTemperature.length - 1],
    indoorTemperature: state.history.indoorTemperature[state.history.indoorTemperature.length - 1],
    outdoorHumidity: state.history.outdoorHumidity[state.history.outdoorHumidity.length - 1],
    indoorHumidity: state.history.indoorHumidity[state.history.indoorHumidity.length - 1],
    co2: state.history.co2[state.history.co2.length - 1],
    daylight: state.history.daylight[state.history.daylight.length - 1]
  };
}
function quantity(name, value, unit) { items.getItem(name).postUpdate(String(value) + ' ' + unit); }
function numeric(name, value) { items.getItem(name).postUpdate(String(value)); }
function publish(sample) {
  quantity('Sensor_BarometricPressure', sample.barometricPressure.toFixed(1), 'hPa');
  quantity('Sensor_OutdoorTemperature', sample.outdoorTemperature.toFixed(1), '°C');
  quantity('Sensor_IndoorTemperature', sample.indoorTemperature.toFixed(1), '°C');
  numeric('Sensor_OutdoorHumidity', sample.outdoorHumidity.toFixed(1));
  numeric('Sensor_IndoorHumidity', sample.indoorHumidity.toFixed(1));
  numeric('Sensor_CO2', sample.co2);
  quantity('Sensor_Daylight', sample.daylight, 'lx');
}
function simulate(date) { const sample = snapshot(date); remember(sample); state.lastMinute = minuteIndex(date); return sample; }
function warmup(target) {
  state.history = makeHistory();
  state.lastMinute = null;
  let sample = null;
  let current = new Date(target.getTime() - (WARMUP - 1) * 60000);
  while (current.getTime() <= target.getTime()) {
    sample = simulate(current);
    current = new Date(current.getTime() + 60000);
  }
  logger.info('Initialized virtual sensor history with ' + WARMUP + ' synthetic samples');
  return sample;
}
function catchUp(now) {
  const target = minute(now);
  const targetIndex = minuteIndex(target);
  if (state.lastMinute === null) { return warmup(target); }
  if (state.lastMinute >= targetIndex) { return latest(); }
  let sample = latest();
  for (let nextIndex = state.lastMinute + 1; nextIndex <= targetIndex; nextIndex += 1) {
    sample = simulate(new Date(nextIndex * 60000));
  }
  return sample;
}
function run() {
  try {
    const sample = catchUp(new Date());
    if (sample !== null) { publish(sample); }
  } catch (error) {
    logger.error('Virtual sensor simulation failed: ' + error);
  }
}
rules.JSRule({
  id: 'virtual-sensor-simulation-startup',
  name: 'Virtual sensor simulation startup',
  description: 'Warm up and publish the current set of virtual sensor values on startup.',
  triggers: [triggers.SystemStartlevelTrigger(100)],
  execute: function () { run(); }
});
rules.JSRule({
  id: 'virtual-sensor-simulation-minute',
  name: 'Virtual sensor simulation every minute',
  description: 'Generate one new deterministic sensor sample every minute.',
  triggers: [triggers.GenericCronTrigger('0 * * * * ?')],
  execute: function () { run(); }
});

