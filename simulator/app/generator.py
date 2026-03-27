from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import math
import random


@dataclass(frozen=True)
class SensorDescriptor:
    sensor_id: str
    zone: str
    lat: float
    lon: float


ZONE_BASELINES = {
    "residential": {"pm25": 14.0, "pm10": 24.0, "co2": 460.0, "no2": 19.0},
    "industrial": {"pm25": 26.0, "pm10": 42.0, "co2": 610.0, "no2": 34.0},
    "park": {"pm25": 10.0, "pm10": 16.0, "co2": 420.0, "no2": 13.0},
    "traffic": {"pm25": 22.0, "pm10": 37.0, "co2": 560.0, "no2": 39.0},
}


def build_sensor_catalog(count: int = 52) -> list[SensorDescriptor]:
    zones = [
        ("residential", 50.4501, 30.5234),
        ("industrial", 50.4652, 30.5126),
        ("park", 50.4547, 30.5383),
        ("traffic", 50.4423, 30.5218),
    ]
    catalog: list[SensorDescriptor] = []
    for index in range(count):
        zone, base_lat, base_lon = zones[index % len(zones)]
        offset = index * 0.001
        catalog.append(
            SensorDescriptor(
                sensor_id=f"sensor-{index + 1:03d}",
                zone=zone,
                lat=round(base_lat + math.sin(index) * 0.002 + offset / 20, 6),
                lon=round(base_lon + math.cos(index) * 0.002 + offset / 20, 6),
            )
        )
    return catalog


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(value, upper))


def generate_measurement(sensor: SensorDescriptor, ts: datetime | None = None) -> list[dict[str, object]]:
    if ts is None:
        ts = datetime.now(tz=timezone.utc)
    baseline = ZONE_BASELINES[sensor.zone]
    temperature = _clamp(random.gauss(17.0, 6.0), -20.0, 38.0)
    humidity = _clamp(random.gauss(58.0, 12.0), 18.0, 95.0)

    pm25 = _clamp(random.gauss(baseline["pm25"], 4.5), 3.0, 180.0)
    pm10 = _clamp(random.gauss(baseline["pm10"], 6.0), 5.0, 220.0)
    co2 = _clamp(random.gauss(baseline["co2"], 45.0), 350.0, 1600.0)
    no2 = _clamp(random.gauss(baseline["no2"], 5.0), 3.0, 200.0)

    base_name = f"urn:ngsi-ld:AirQualityObserved:{sensor.sensor_id}:"
    base_time = int(ts.timestamp())

    return [
        {"bn": base_name, "bt": base_time, "n": "pm25", "u": "ug/m3", "v": round(pm25, 2)},
        {"n": "pm10", "u": "ug/m3", "v": round(pm10, 2)},
        {"n": "co2", "u": "ppm", "v": round(co2, 2)},
        {"n": "no2", "u": "ug/m3", "v": round(no2, 2)},
        {"n": "temperature", "u": "Cel", "v": round(temperature, 2)},
        {"n": "humidity", "u": "%RH", "v": round(humidity, 2)},
        {"n": "zone", "vs": sensor.zone},
        {"n": "lat", "u": "deg", "v": sensor.lat},
        {"n": "lon", "u": "deg", "v": sensor.lon},
    ]
