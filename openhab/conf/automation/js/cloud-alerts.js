'use strict';
// ============================================================
// Variant 5: Edge Analytics Node
// cloud-alerts.js  –  Minimal Cloud Communication
//
// Runs at second 40 of every minute (last step in pipeline).
// Enforces the "only alerts to cloud" policy:
//
//   • NO raw sensor data is ever uploaded.
//   • Only anomaly summary payloads are transmitted.
//   • Batching: all anomalies in one cycle → one HTTP POST.
//   • Idle minutes produce zero cloud traffic.
//
// Bandwidth accounting tracks actual bytes sent versus what
// a naive raw-streaming approach would have consumed, then
// publishes the saving percentage to the Edge_BandwidthSaving
// item for dashboard visibility.
//
// Alert payload format (JSON, compact):
//   { node, ts, batch_id, alert_count,
//     alerts: [{ s, type, sev, val, mean, z }, …] }
//
// Configure CLOUD_ENDPOINT to your target webhook or REST API.
// During development, https://httpbin.org/post echoes the body.
// ============================================================
const { items, log, rules, triggers, actions } = require('openhab');
const logger = log('cloud-alerts');

// ─── Configuration ────────────────────────────────────────────────────────
// Replace with the actual cloud endpoint in production.
var CLOUD_ENDPOINT      = 'https://httpbin.org/post';
var HTTP_TIMEOUT_MS     = 8000;   // 8 s connection + read timeout
var SEND_ON_ALERT_ONLY  = true;   // never upload when no anomalies

// ─── Bandwidth reference model ────────────────────────────────────────────
// If every reading were streamed raw every minute:
//   9 sensors × 8 bytes (IEEE 754 double) = 72 B/min
// The edge node instead sends anomaly summaries only.
var RAW_BYTES_PER_MIN = 9 * 8;   // 72 bytes

// ─── Module-level accumulators (persist across cron invocations) ──────────
var totalBytesSent  = 0;
var totalMinutes    = 0;
var totalAlertsSent = 0;
var totalBatches    = 0;

// ─── Main dispatch run ────────────────────────────────────────────────────
function runDispatch() {
  // Retrieve alerts from shared cache as JSON string and parse
  var alertsJson = cache.shared.get('edge_alert_queue');
  var alerts = [];
  if (alertsJson !== null) {
    try {
      alerts = JSON.parse(alertsJson);
    } catch (e) {
      logger.warn('Failed to parse alerts JSON: ' + e);
      alerts = [];
    }
  }

  totalMinutes++;

  // ── Bandwidth saving update (done every cycle regardless) ─────────────
  var rawTotal = totalMinutes * RAW_BYTES_PER_MIN;
  var saving   = rawTotal > 0
    ? Math.max(0, Math.min(100, Math.round((1 - totalBytesSent / rawTotal) * 100)))
    : 100;
  items.getItem('Edge_BandwidthSaving').postUpdate(saving);

  // ── Nothing to send? ──────────────────────────────────────────────────
  if (SEND_ON_ALERT_ONLY && alerts.length === 0) {
    items.getItem('Edge_CloudStatus').postUpdate('IDLE');
    return;
  }

  // ── Build compact alert payload (summary only – no raw arrays) ────────
  totalBatches++;
  var payload = {
    node:        'building-edge-01',
    ts:          new Date().toISOString(),
    batch_id:    totalBatches,
    alert_count: alerts.length,
    alerts: alerts.map(function (a) {
      return {
        s:    a.sensor,
        type: a.type,
        sev:  a.severity,
        val:  a.value,
        mean: a.mean,
        z:    a.zscore
      };
    })
  };

  var payloadStr   = JSON.stringify(payload);
  var payloadBytes = payloadStr.length;   // UTF-8 length ≈ byte count for ASCII JSON

  // ── HTTP POST ─────────────────────────────────────────────────────────
  var cloudStatus = 'OK';
  try {
    var response = actions.HTTP.sendHttpPostRequest(
      CLOUD_ENDPOINT,
      'application/json',
      payloadStr,
      HTTP_TIMEOUT_MS
    );
    cloudStatus = response ? 'OK (' + payloadBytes + ' B sent)' : 'TIMEOUT';
    logger.debug('Batch #' + totalBatches + ' sent: ' + payloadBytes + ' B, ' +
                 alerts.length + ' alerts → ' + CLOUD_ENDPOINT);
  } catch (httpErr) {
    cloudStatus = 'ERR: ' + String(httpErr).substring(0, 40);
    logger.warn('HTTP dispatch error: ' + httpErr);
    // On HTTP error we still count the bytes as "not sent" to keep saving% accurate.
    // Re-set payloadBytes to 0 so the failed attempt doesn't inflate the sent counter.
    payloadBytes = 0;
  }

  // ── Update accumulators and items ─────────────────────────────────────
  totalBytesSent  += payloadBytes;
  totalAlertsSent += alerts.length;

  // Recalculate saving with updated bytes
  rawTotal = totalMinutes * RAW_BYTES_PER_MIN;
  saving   = rawTotal > 0
    ? Math.max(0, Math.min(100, Math.round((1 - totalBytesSent / rawTotal) * 100)))
    : 100;

  items.getItem('Edge_BandwidthSaving').postUpdate(saving);
  items.getItem('Edge_AlertsSent').postUpdate(totalAlertsSent);
  items.getItem('Edge_Batch_Count').postUpdate(totalBatches);
  items.getItem('Edge_CloudStatus').postUpdate(cloudStatus);

  // Preview of what was sent (first anomaly summary for display)
  if (alerts.length > 0) {
    var first = alerts[0];
    items.getItem('Edge_Alert_LastMsg').postUpdate(
      first.sensor + ' ' + first.type + ' val=' + first.value
    );
  }
}

// ─── Rules ────────────────────────────────────────────────────────────────
rules.JSRule({
  id:          'cloud-alerts-startup',
  name:        'Cloud Alerts – startup',
  description: 'Variant 5: Initialise cloud communication status on startup.',
  triggers:    [triggers.SystemStartlevelTrigger(100)],
  execute: function () {
    try {
      items.getItem('Edge_CloudStatus').postUpdate('INITIALISING');
      items.getItem('Edge_Alert_LastMsg').postUpdate('No alerts yet');
      items.getItem('Edge_AlertsSent').postUpdate(0);
      items.getItem('Edge_Batch_Count').postUpdate(0);
      items.getItem('Edge_BandwidthSaving').postUpdate(100);
    } catch (e) { logger.error('Startup init failed: ' + e); }
  }
});

rules.JSRule({
  id:          'cloud-alerts-cron',
  name:        'Cloud Alerts – batch dispatcher',
  description: 'Variant 5: Send anomaly-only batches to cloud; track bandwidth savings.',
  triggers:    [triggers.GenericCronTrigger('40 * * * * ?')],
  execute: function () {
    try { runDispatch(); } catch (e) {
      logger.error('Dispatch failed: ' + e);
      items.getItem('Edge_CloudStatus').postUpdate('ERROR');
    }
  }
});
