from __future__ import annotations

from datetime import datetime, timezone
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.generator import build_sensor_catalog, generate_measurement


class GeneratorTests(unittest.TestCase):
    def test_catalog_size(self) -> None:
        catalog = build_sensor_catalog(52)
        self.assertEqual(len(catalog), 52)
        self.assertEqual(catalog[0].sensor_id, "sensor-001")

    def test_measurement_has_expected_fields(self) -> None:
        sensor = build_sensor_catalog(1)[0]
        payload = generate_measurement(sensor, datetime(2026, 3, 27, 9, 0, tzinfo=timezone.utc))
        names = {entry["n"] for entry in payload}
        self.assertIn("pm25", names)
        self.assertIn("pm10", names)
        self.assertIn("co2", names)
        self.assertIn("no2", names)
        self.assertIn("temperature", names)
        self.assertIn("humidity", names)
        self.assertIn("zone", names)
        self.assertIn("lat", names)
        self.assertIn("lon", names)

    def test_pollutants_are_positive(self) -> None:
        sensor = build_sensor_catalog(1)[0]
        payload = generate_measurement(sensor)
        numeric = {entry["n"]: entry["v"] for entry in payload if "v" in entry}
        self.assertGreaterEqual(numeric["pm25"], 0)
        self.assertGreaterEqual(numeric["pm10"], 0)
        self.assertGreaterEqual(numeric["co2"], 0)
        self.assertGreaterEqual(numeric["no2"], 0)


if __name__ == "__main__":
    unittest.main()
