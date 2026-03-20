'use strict';
const { items, log, rules, triggers } = require('openhab');
const logger = log('multi-sensor-analytics');
const MAX_HISTORY = 240;
const WINDOWS = { sma: 15, ema: 30, dispersion: 30, extrema: 60, percentile: 60, correlation: 60, trend: 45, change: 20, lag: 8 };
const MIN_SAMPLES = { correlation: 3, matrix: 8, lag: 12, trend: 3, forecast: 3, change: 6 };
const SENSORS = [
  { key: 'outdoorTemperature', item: 'Sensor_OutdoorTemperature', short: 'OutT' },
  { key: 'indoorTemperature', item: 'Sensor_IndoorTemperature', short: 'InT' },
  { key: 'outdoorHumidity', item: 'Sensor_OutdoorHumidity', short: 'OutH' },
  { key: 'indoorHumidity', item: 'Sensor_IndoorHumidity', short: 'InH' },
  { key: 'barometricPressure', item: 'Sensor_BarometricPressure', short: 'Pres' },
  { key: 'co2', item: 'Sensor_CO2', short: 'CO2' },
  { key: 'daylight', item: 'Sensor_Daylight', short: 'Day' }
];
const MATRIX_ITEMS = {
  header: 'Analytics_CorrelationMatrix_Header',
  outdoorTemperature: 'Analytics_CorrelationMatrix_OutdoorTemperature',
  indoorTemperature: 'Analytics_CorrelationMatrix_IndoorTemperature',
  outdoorHumidity: 'Analytics_CorrelationMatrix_OutdoorHumidity',
  indoorHumidity: 'Analytics_CorrelationMatrix_IndoorHumidity',
  barometricPressure: 'Analytics_CorrelationMatrix_BarometricPressure',
  co2: 'Analytics_CorrelationMatrix_CO2',
  daylight: 'Analytics_CorrelationMatrix_Daylight'
};
const PAIRS = [
  { a: 'outdoorTemperature', b: 'indoorTemperature', correlation: 'Analytics_Correlation_OutdoorIndoorTemp', band: 'Analytics_CorrelationBand_OutdoorIndoorTemp', lead: 'Analytics_LeadLag_OutdoorIndoorTemp', cause: 'Analytics_Causality_OutdoorIndoorTemp', labelA: 'Outdoor temperature', labelB: 'Indoor temperature' },
  { a: 'outdoorTemperature', b: 'outdoorHumidity', correlation: 'Analytics_Correlation_OutdoorTempOutdoorHumidity', band: 'Analytics_CorrelationBand_OutdoorTempOutdoorHumidity', labelA: 'Outdoor temperature', labelB: 'Outdoor humidity' },
  { a: 'barometricPressure', b: 'outdoorHumidity', correlation: 'Analytics_Correlation_PressureOutdoorHumidity', band: 'Analytics_CorrelationBand_PressureOutdoorHumidity', labelA: 'Barometric pressure', labelB: 'Outdoor humidity' },
  { a: 'daylight', b: 'outdoorTemperature', correlation: 'Analytics_Correlation_DaylightOutdoorTemp', band: 'Analytics_CorrelationBand_DaylightOutdoorTemp', lead: 'Analytics_LeadLag_DaylightOutdoorTemp', cause: 'Analytics_Causality_DaylightOutdoorTemp', labelA: 'Daylight', labelB: 'Outdoor temperature' },
  { a: 'co2', b: 'indoorHumidity', correlation: 'Analytics_Correlation_CO2IndoorHumidity', band: 'Analytics_CorrelationBand_CO2IndoorHumidity', labelA: 'CO2', labelB: 'Indoor humidity' }
];
const state = { history: makeHistory(), lastMinute: null };
function makeHistory() { const history = {}; SENSORS.forEach(function (sensor) { history[sensor.key] = []; }); return history; }
const round = function (value, digits) { const factor = Math.pow(10, digits); return Math.round(value * factor) / factor; };
function minuteIndex() { return Math.floor(new Date().getTime() / 60000); }
function readNumber(name) {
  const stateValue = items.getItem(name).state;
  if (!stateValue) { return null; }
  const text = stateValue.toString();
  const match = text === 'NULL' || text === 'UNDEF' ? null : text.match(/-?\d+(?:\.\d+)?/);
  if (!match) { return null; }
  const parsed = parseFloat(match[0]);
  return isFinite(parsed) ? parsed : null;
}
function push(key, value) { const series = state.history[key]; series.push(value); if (series.length > MAX_HISTORY) { series.shift(); } }
function slice(key, count) { const series = state.history[key]; return series.slice(Math.max(0, series.length - count)); }
function cleanValues(values) { return values.filter(function (value) { return value !== null && isFinite(value); }); }
const mean = function (values) {
  const clean = cleanValues(values);
  return clean.length ? clean.reduce(function (sum, value) { return sum + value; }, 0) / clean.length : null;
};
function ema(values, window) {
  const clean = cleanValues(values);
  if (!clean.length) { return null; }
  const alpha = 2 / (window + 1);
  let result = clean[0];
  for (let index = 1; index < clean.length; index += 1) { result = alpha * clean[index] + (1 - alpha) * result; }
  return result;
}
function stddev(values) {
  const clean = cleanValues(values);
  if (clean.length < 2) { return null; }
  const avg = mean(clean);
  const variance = clean.reduce(function (sum, value) { return sum + Math.pow(value - avg, 2); }, 0) / clean.length;
  return Math.sqrt(variance);
}
function percentile(values, point) {
  const clean = cleanValues(values);
  if (!clean.length) { return null; }
  const sorted = clean.slice().sort(function (left, right) { return left - right; });
  const index = (point / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) { return sorted[lower]; }
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
function pearson(left, right) {
  if (left.length !== right.length || left.length < 3) { return null; }
  const leftMean = mean(left);
  const rightMean = mean(right);
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    numerator += (left[index] - leftMean) * (right[index] - rightMean);
    leftVariance += Math.pow(left[index] - leftMean, 2);
    rightVariance += Math.pow(right[index] - rightMean, 2);
  }
  if (leftVariance === 0 || rightVariance === 0) { return 0; }
  return numerator / Math.sqrt(leftVariance * rightVariance);
}
function slope(values) {
  const clean = cleanValues(values);
  if (clean.length < MIN_SAMPLES.trend) { return null; }
  const xMean = (clean.length - 1) / 2;
  const yMean = mean(clean);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < clean.length; index += 1) { numerator += (index - xMean) * (clean[index] - yMean); denominator += Math.pow(index - xMean, 2); }
  return denominator === 0 ? 0 : numerator / denominator;
}
function trendFromSlope(value, threshold) {
  if (value === null) { return 'INSUFFICIENT_DATA'; }
  if (value > threshold) { return 'UP'; }
  if (value < -threshold) { return 'DOWN'; }
  return 'STABLE';
}
function changePoint(values, factor, floor) {
  const clean = cleanValues(values);
  if (clean.length < MIN_SAMPLES.change) { return 'INSUFFICIENT_DATA'; }
  const split = Math.floor(clean.length / 2);
  const diff = mean(clean.slice(split)) - mean(clean.slice(0, split));
  const threshold = Math.max(floor, (stddev(clean) || 0) * factor);
  if (diff > threshold) { return 'SHIFT_UP'; }
  if (diff < -threshold) { return 'SHIFT_DOWN'; }
  return 'NO_CHANGE';
}
function forecast(values, trend) {
  const clean = cleanValues(values);
  return clean.length >= MIN_SAMPLES.forecast && trend !== null ? clean[clean.length - 1] + trend * 60 : null;
}
function minValue(values) { const clean = cleanValues(values); return clean.length ? Math.min.apply(null, clean) : null; }
function maxValue(values) { const clean = cleanValues(values); return clean.length ? Math.max.apply(null, clean) : null; }
function band(value) {
  if (value === null) { return 'INSUFFICIENT_DATA'; }
  if (value >= 0.85) { return 'VERY_STRONG_POSITIVE'; }
  if (value >= 0.65) { return 'STRONG_POSITIVE'; }
  if (value >= 0.35) { return 'MODERATE_POSITIVE'; }
  if (value > 0.15) { return 'WEAK_POSITIVE'; }
  if (value > -0.15) { return 'NEUTRAL'; }
  if (value > -0.35) { return 'WEAK_NEGATIVE'; }
  if (value > -0.65) { return 'MODERATE_NEGATIVE'; }
  if (value > -0.85) { return 'STRONG_NEGATIVE'; }
  return 'VERY_STRONG_NEGATIVE';
}
function lagCorrelation(left, right, lag) {
  if (lag > 0) { return pearson(left.slice(0, left.length - lag), right.slice(lag)); }
  if (lag < 0) { return pearson(left.slice(-lag), right.slice(0, right.length + lag)); }
  return pearson(left, right);
}
function lagAnalysis(left, right) {
  if (left.length < 12 || right.length < 12) { return { lag: 0, best: null, base: null }; }
  let bestLag = 0;
  let best = lagCorrelation(left, right, 0);
  for (let offset = -WINDOWS.lag; offset <= WINDOWS.lag; offset += 1) {
    const candidate = lagCorrelation(left, right, offset);
    if (candidate !== null && (best === null || Math.abs(candidate) > Math.abs(best))) { best = candidate; bestLag = offset; }
  }
  return { lag: bestLag, best: best, base: lagCorrelation(left, right, 0) };
}
function leadText(pair, analysis) {
  if (analysis.best === null) { return 'INSUFFICIENT_DATA'; }
  if (analysis.lag > 0) { return pair.labelA + ' leads ' + pair.labelB + ' by ' + analysis.lag + ' min (r=' + round(analysis.best, 2).toFixed(2) + ')'; }
  if (analysis.lag < 0) { return pair.labelB + ' leads ' + pair.labelA + ' by ' + Math.abs(analysis.lag) + ' min (r=' + round(analysis.best, 2).toFixed(2) + ')'; }
  return 'Synchronous response (r=' + round(analysis.best, 2).toFixed(2) + ')';
}
function causeText(pair, analysis) {
  if (analysis.best === null || analysis.base === null) { return 'INSUFFICIENT_DATA'; }
  const improvement = Math.abs(analysis.best) - Math.abs(analysis.base);
  if (improvement < 0.08) { return 'No strong directional signal'; }
  if (analysis.lag > 0) { return pair.labelA + ' -> ' + pair.labelB + ' heuristic score ' + round(improvement, 2).toFixed(2); }
  if (analysis.lag < 0) { return pair.labelB + ' -> ' + pair.labelA + ' heuristic score ' + round(improvement, 2).toFixed(2); }
  return 'No directional edge over zero-lag baseline';
}
function postNumber(name, value, digits) { if (value !== null && isFinite(value)) { items.getItem(name).postUpdate(round(value, digits).toFixed(digits)); } }
function postQuantity(name, value, digits, unit) { if (value !== null && isFinite(value)) { items.getItem(name).postUpdate(round(value, digits).toFixed(digits) + ' ' + unit); } }
function postText(name, value) { items.getItem(name).postUpdate(value); }
function cell(value) { if (value === null || !isFinite(value)) { return '  --'; } return value >= 0 ? ' ' + value.toFixed(2) : value.toFixed(2); }
function updateMatrix() {
  postText(MATRIX_ITEMS.header, '      OutT   InT  OutH   InH  Pres   CO2   Day');
  const available = slice('outdoorTemperature', WINDOWS.correlation).length;
  if (available < 8) {
    postText(MATRIX_ITEMS.outdoorTemperature, 'OutT collecting samples');
    postText(MATRIX_ITEMS.indoorTemperature, 'InT collecting samples');
    postText(MATRIX_ITEMS.outdoorHumidity, 'OutH collecting samples');
    postText(MATRIX_ITEMS.indoorHumidity, 'InH collecting samples');
    postText(MATRIX_ITEMS.barometricPressure, 'Pres collecting samples');
    postText(MATRIX_ITEMS.co2, 'CO2 collecting samples');
    postText(MATRIX_ITEMS.daylight, 'Day collecting samples');
    return;
  }
  const values = {};
  SENSORS.forEach(function (sensor) { values[sensor.key] = slice(sensor.key, WINDOWS.correlation); });
  SENSORS.forEach(function (rowSensor) {
    const cells = SENSORS.map(function (colSensor) { return rowSensor.key === colSensor.key ? ' 1.00' : cell(pearson(values[rowSensor.key], values[colSensor.key])); });
    postText(MATRIX_ITEMS[rowSensor.key], rowSensor.short + ' ' + cells.join(' '));
  });
}
function collectSample() {
  const sample = {};
  for (let index = 0; index < SENSORS.length; index += 1) {
    const sensor = SENSORS[index];
    const value = readNumber(sensor.item);
    if (value === null || !isFinite(value)) { return null; }
    sample[sensor.key] = value;
  }
  return sample;
}
function updateMetrics() {
  const temperatureCorrelationWindow = slice('outdoorTemperature', WINDOWS.correlation).length;
  postQuantity('Analytics_OutdoorTemperature_SMA15', mean(slice('outdoorTemperature', WINDOWS.sma)), 1, '°C');
  postQuantity('Analytics_OutdoorTemperature_EMA30', ema(slice('outdoorTemperature', WINDOWS.ema), WINDOWS.ema), 1, '°C');
  postNumber('Analytics_OutdoorTemperature_StdDev', stddev(slice('outdoorTemperature', WINDOWS.dispersion)), 2);
  postQuantity('Analytics_OutdoorTemperature_Min60', minValue(slice('outdoorTemperature', WINDOWS.extrema)), 1, '°C');
  postQuantity('Analytics_OutdoorTemperature_Max60', maxValue(slice('outdoorTemperature', WINDOWS.extrema)), 1, '°C');
  postQuantity('Analytics_OutdoorTemperature_P90', percentile(slice('outdoorTemperature', WINDOWS.percentile), 90), 1, '°C');
  postQuantity('Analytics_BarometricPressure_SMA15', mean(slice('barometricPressure', WINDOWS.sma)), 1, 'hPa');
  postQuantity('Analytics_BarometricPressure_EMA30', ema(slice('barometricPressure', WINDOWS.ema), WINDOWS.ema), 1, 'hPa');
  postNumber('Analytics_BarometricPressure_StdDev', stddev(slice('barometricPressure', WINDOWS.dispersion)), 2);
  postQuantity('Analytics_BarometricPressure_Min60', minValue(slice('barometricPressure', WINDOWS.extrema)), 1, 'hPa');
  postQuantity('Analytics_BarometricPressure_Max60', maxValue(slice('barometricPressure', WINDOWS.extrema)), 1, 'hPa');
  postNumber('Analytics_CO2_P95', percentile(slice('co2', WINDOWS.percentile), 95), 0);
  PAIRS.forEach(function (pair) {
    const left = slice(pair.a, WINDOWS.correlation);
    const right = slice(pair.b, WINDOWS.correlation);
    const correlation = pearson(left, right);
    postNumber(pair.correlation, correlation, 2);
    postText(pair.band, band(correlation));
    if (pair.lead && pair.cause) {
      const analysis = lagAnalysis(left, right);
      postText(pair.lead, leadText(pair, analysis));
      postText(pair.cause, causeText(pair, analysis));
    }
  });
  const tempTrend = slice('outdoorTemperature', WINDOWS.trend);
  const pressureTrend = slice('barometricPressure', WINDOWS.trend);
  const tempSlope = slope(tempTrend);
  const pressureSlope = slope(pressureTrend);
  postNumber('Analytics_OutdoorTemperature_Slope', tempSlope, 3);
  postText('Analytics_OutdoorTemperature_TrendDirection', trendFromSlope(tempSlope, 0.025));
  postText('Analytics_OutdoorTemperature_ChangePoint', changePoint(slice('outdoorTemperature', WINDOWS.change), 1.1, 0.7));
  postQuantity('Analytics_OutdoorTemperature_Forecast60m', forecast(tempTrend, tempSlope), 1, '°C');
  postNumber('Analytics_BarometricPressure_Slope', pressureSlope, 3);
  postText('Analytics_BarometricPressure_TrendDirection', trendFromSlope(pressureSlope, 0.04));
  postText('Analytics_BarometricPressure_ChangePoint', changePoint(slice('barometricPressure', WINDOWS.change), 1.05, 0.9));
  postQuantity('Analytics_BarometricPressure_Forecast60m', forecast(pressureTrend, pressureSlope), 1, 'hPa');
  updateMatrix();
  postText('Analytics_Status', temperatureCorrelationWindow < WINDOWS.correlation ? 'Warm-up ' + temperatureCorrelationWindow + '/' + WINDOWS.correlation + ' samples' : 'Ready: full analytics window active');
  items.getItem('Analytics_SampleCount').postUpdate(String(state.history.outdoorTemperature.length));
  items.getItem('Analytics_LastCalculation').postUpdate(new Date().toISOString());
}
function run(reason) {
  try {
    const currentMinute = minuteIndex();
    if (state.lastMinute === currentMinute && reason !== 'startup') { return; }
    const sample = collectSample();
    if (sample === null) { postText('Analytics_Status', 'Waiting for sensor states'); return; }
    SENSORS.forEach(function (sensor) { push(sensor.key, sample[sensor.key]); });
    state.lastMinute = currentMinute;
    updateMetrics();
  } catch (error) {
    logger.error('Analytics update failed: ' + error);
  }
}
rules.JSRule({
  id: 'multi-sensor-analytics-startup',
  name: 'Multi-sensor analytics startup',
  description: 'Reset analytics state and attempt an initial calculation on startup.',
  triggers: [triggers.SystemStartlevelTrigger(100)],
  execute: function () { state.history = makeHistory(); state.lastMinute = null; postText('Analytics_Status', 'Waiting for sensor states'); items.getItem('Analytics_SampleCount').postUpdate('0'); updateMatrix(); run('startup'); }
});
rules.JSRule({
  id: 'multi-sensor-analytics-sample',
  name: 'Multi-sensor analytics sample',
  description: 'Recalculate analytics after each sensor cycle and on a minute safety timer.',
  triggers: [triggers.ItemStateUpdateTrigger('Sensor_Daylight'), triggers.GenericCronTrigger('10 * * * * ?')],
  execute: function () { run('sample'); }
});

