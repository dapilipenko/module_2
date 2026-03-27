from __future__ import annotations

import os
from urllib import parse, request

import paho.mqtt.client as mqtt

from app.senml import parse_senml


def _escape_tag(value: object) -> str:
    return str(value).replace("\\", "\\\\").replace(" ", "\\ ").replace(",", "\\,").replace("=", "\\=")


def write_influx(payload: dict[str, object]) -> None:
    influx_url = os.getenv("INFLUX_URL", "http://localhost:8086")
    org = os.getenv("INFLUX_ORG", "air-quality")
    bucket = os.getenv("INFLUX_BUCKET", "airquality")
    token = os.getenv("INFLUX_TOKEN", "air-quality-token")

    timestamp_ns = int(payload["timestamp"]) * 1_000_000_000
    line = (
        f"air_quality,"
        f"sensor_id={_escape_tag(payload['sensor_id'])},"
        f"zone={_escape_tag(payload.get('zone', 'unknown'))} "
        f"pm25={float(payload.get('pm25', 0.0))},"
        f"pm10={float(payload.get('pm10', 0.0))},"
        f"co2={float(payload.get('co2', 0.0))},"
        f"no2={float(payload.get('no2', 0.0))},"
        f"temperature={float(payload.get('temperature', 0.0))},"
        f"humidity={float(payload.get('humidity', 0.0))},"
        f"lat={float(payload.get('lat', 0.0))},"
        f"lon={float(payload.get('lon', 0.0))} "
        f"{timestamp_ns}"
    )

    url = (
        f"{influx_url}/api/v2/write?"
        f"{parse.urlencode({'org': org, 'bucket': bucket, 'precision': 'ns'})}"
    )
    req = request.Request(url, data=line.encode("utf-8"), method="POST")
    req.add_header("Authorization", f"Token {token}")
    req.add_header("Content-Type", "text/plain; charset=utf-8")
    with request.urlopen(req, timeout=10):
        return


def on_message(client: mqtt.Client, userdata: dict[str, object], msg: mqtt.MQTTMessage) -> None:
    del client, userdata
    payload = parse_senml(msg.payload.decode("utf-8"))
    write_influx(payload)


def main() -> None:
    mqtt_host = os.getenv("MQTT_HOST", "localhost")
    mqtt_port = int(os.getenv("MQTT_PORT", "1883"))
    mqtt_topic = os.getenv("MQTT_TOPIC", "airquality/+/+/measurements")

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="air-quality-ingestor")
    client.on_message = on_message
    client.connect(mqtt_host, mqtt_port, keepalive=60)
    client.subscribe(mqtt_topic, qos=1)
    client.loop_forever()


if __name__ == "__main__":
    main()
