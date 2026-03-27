CREATE TABLE IF NOT EXISTS zone_hourly_aggregates (
    bucket_start TIMESTAMPTZ NOT NULL,
    zone TEXT NOT NULL,
    avg_pm25 DOUBLE PRECISION NOT NULL,
    avg_pm10 DOUBLE PRECISION NOT NULL,
    avg_co2 DOUBLE PRECISION NOT NULL,
    avg_no2 DOUBLE PRECISION NOT NULL,
    sensor_count INTEGER NOT NULL,
    data_completeness_pct DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (bucket_start, zone)
);

CREATE TABLE IF NOT EXISTS zone_daily_aggregates (
    day DATE NOT NULL,
    zone TEXT NOT NULL,
    avg_pm25 DOUBLE PRECISION NOT NULL,
    avg_pm10 DOUBLE PRECISION NOT NULL,
    avg_co2 DOUBLE PRECISION NOT NULL,
    avg_no2 DOUBLE PRECISION NOT NULL,
    max_risk_level TEXT NOT NULL,
    PRIMARY KEY (day, zone)
);
