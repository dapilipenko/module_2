from __future__ import annotations

import json
from datetime import datetime, timezone


def parse_senml(payload: str) -> dict[str, object]:
    pack = json.loads(payload)
    if not isinstance(pack, list) or not pack:
        raise ValueError("SenML payload must be a non-empty list")

    base_name = str(pack[0].get("bn", ""))
    parts = [part for part in base_name.split(":") if part]
    sensor_id = parts[-1] if parts else "unknown"
    base_time = int(pack[0].get("bt", int(datetime.now(tz=timezone.utc).timestamp())))

    result: dict[str, object] = {
        "sensor_id": sensor_id,
        "timestamp": base_time,
    }
    for entry in pack:
        name = entry.get("n")
        if not name:
            continue
        if "v" in entry:
            result[str(name)] = entry["v"]
        elif "vs" in entry:
            result[str(name)] = entry["vs"]
    return result


def classify_risk(pm25: float, no2: float) -> str:
    if pm25 >= 55 or no2 >= 100:
        return "dangerous"
    if pm25 >= 35 or no2 >= 70:
        return "harmful"
    if pm25 >= 15 or no2 >= 30:
        return "moderate"
    return "good"


def build_zone_summary(zone: str, sensor_payloads: list[dict[str, object]]) -> dict[str, object]:
    if not sensor_payloads:
        raise ValueError("sensor_payloads must not be empty")

    count = len(sensor_payloads)

    def avg(metric: str) -> float:
        return round(sum(float(payload.get(metric, 0.0)) for payload in sensor_payloads) / count, 2)

    summary = {
        "zone": zone,
        "avg_pm25": avg("pm25"),
        "avg_pm10": avg("pm10"),
        "avg_co2": avg("co2"),
        "avg_no2": avg("no2"),
        "avg_temperature": avg("temperature"),
        "avg_humidity": avg("humidity"),
        "sensor_count": count,
    }
    risk = classify_risk(float(summary["avg_pm25"]), float(summary["avg_no2"]))
    summary["risk"] = risk
    summary["alert_state"] = "ON" if risk in {"harmful", "dangerous"} else "OFF"
    summary["updated_at"] = datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    return summary


def build_city_summary(zone_summaries: dict[str, dict[str, object]]) -> dict[str, object]:
    if not zone_summaries:
        raise ValueError("zone_summaries must not be empty")

    summaries = list(zone_summaries.values())
    count = len(summaries)
    avg_pm25 = round(sum(float(summary["avg_pm25"]) for summary in summaries) / count, 2)
    avg_no2 = round(sum(float(summary["avg_no2"]) for summary in summaries) / count, 2)
    overall_risk = classify_risk(avg_pm25, avg_no2)
    worst_zone = max(
        summaries,
        key=lambda summary: (float(summary["avg_pm25"]), float(summary["avg_no2"])),
    )["zone"]
    active_alerts = sum(1 for summary in summaries if summary["alert_state"] == "ON")

    return {
        "avg_pm25": avg_pm25,
        "avg_no2": avg_no2,
        "overall_risk": overall_risk,
        "worst_zone": worst_zone,
        "active_alerts": active_alerts,
        "updated_at": datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat(),
    }
