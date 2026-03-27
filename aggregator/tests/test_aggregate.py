from __future__ import annotations

import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.aggregate import build_city_summary, build_zone_summary, classify_risk, parse_senml


class AggregatorTests(unittest.TestCase):
    def test_parse_senml_extracts_zone(self) -> None:
        payload = json.dumps(
            [
                {
                    "bn": "urn:ngsi-ld:AirQualityObserved:sensor-101:",
                    "bt": 1774586400,
                    "n": "pm25",
                    "u": "ug/m3",
                    "v": 21.0,
                },
                {"n": "no2", "u": "ug/m3", "v": 35.0},
                {"n": "zone", "vs": "traffic"},
            ]
        )
        result = parse_senml(payload)
        self.assertEqual(result["sensor_id"], "sensor-101")
        self.assertEqual(result["zone"], "traffic")

    def test_classify_risk(self) -> None:
        self.assertEqual(classify_risk(10.0, 20.0), "good")
        self.assertEqual(classify_risk(18.0, 20.0), "moderate")
        self.assertEqual(classify_risk(40.0, 40.0), "harmful")
        self.assertEqual(classify_risk(60.0, 40.0), "dangerous")

    def test_build_zone_summary(self) -> None:
        summary = build_zone_summary(
            "traffic",
            [
                {"pm25": 30.0, "pm10": 45.0, "co2": 570.0, "no2": 50.0, "temperature": 18.0, "humidity": 55.0},
                {"pm25": 40.0, "pm10": 55.0, "co2": 610.0, "no2": 60.0, "temperature": 19.0, "humidity": 57.0},
            ],
        )
        self.assertEqual(summary["zone"], "traffic")
        self.assertEqual(summary["sensor_count"], 2)
        self.assertEqual(summary["risk"], "harmful")
        self.assertEqual(summary["alert_state"], "ON")

    def test_build_city_summary(self) -> None:
        city = build_city_summary(
            {
                "park": {"zone": "park", "avg_pm25": 10.0, "avg_no2": 14.0, "alert_state": "OFF"},
                "traffic": {"zone": "traffic", "avg_pm25": 42.0, "avg_no2": 65.0, "alert_state": "ON"},
            }
        )
        self.assertEqual(city["worst_zone"], "traffic")
        self.assertEqual(city["active_alerts"], 1)


if __name__ == "__main__":
    unittest.main()
