-- Hourly averages by zone
SELECT
    date_trunc('hour', ts) AS bucket_start,
    zone,
    AVG(pm25) AS avg_pm25,
    AVG(pm10) AS avg_pm10,
    AVG(co2) AS avg_co2,
    AVG(no2) AS avg_no2,
    COUNT(*) AS sample_count
FROM raw_measurements
WHERE ts >= NOW() - INTERVAL '24 hours'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- Z-score anomaly detection for PM2.5
WITH baseline AS (
    SELECT
        zone,
        AVG(pm25) AS mean_pm25,
        STDDEV_POP(pm25) AS std_pm25
    FROM raw_measurements
    WHERE ts >= NOW() - INTERVAL '7 days'
    GROUP BY zone
)
SELECT
    r.ts,
    r.zone,
    r.sensor_id,
    r.pm25,
    ROUND((r.pm25 - b.mean_pm25) / NULLIF(b.std_pm25, 0), 2) AS z_score
FROM raw_measurements r
JOIN baseline b ON b.zone = r.zone
WHERE r.ts >= NOW() - INTERVAL '1 hour'
  AND ABS((r.pm25 - b.mean_pm25) / NULLIF(b.std_pm25, 0)) >= 3
ORDER BY r.ts DESC;

-- Weekly trend by zone
SELECT
    date_trunc('day', ts) AS day_bucket,
    zone,
    AVG(pm25) AS avg_pm25,
    AVG(no2) AS avg_no2
FROM raw_measurements
WHERE ts >= NOW() - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY 1, 2;
