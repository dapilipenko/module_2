# Persistence Add-ons

This directory documents the persistence backends relevant to the Variant 3 scenario.

- rrd4j is enabled by default for chart history and compact numeric archives.
- mapdb is enabled by default for restoring sensor and calculated item states after restart.
- influxdb can be added later for long-term time-series storage.
- jdbc can be added later for SQL-backed reporting.
