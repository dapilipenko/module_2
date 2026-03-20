# Analytics Results Documentation

## Evaluation window

Sample interpretation window: March 20, 2026, 09:00-12:00 Europe/Kiev.
The exact values can drift as the simulation continues, but the relation patterns below are representative of the configured model.

## Example correlation matrix

Columns and rows use the short names shown in the sitemap matrix block.

|      | OutT | InT  | OutH | InH  | Pres | CO2  | Day  |
|------|------|------|------|------|------|------|------|
| OutT | 1.00 | 0.88 | -0.84 | -0.52 | -0.41 | 0.18 | 0.76 |
| InT  | 0.88 | 1.00 | -0.61 | -0.47 | -0.28 | 0.54 | 0.63 |
| OutH | -0.84 | -0.61 | 1.00 | 0.69 | -0.57 | 0.16 | -0.64 |
| InH  | -0.52 | -0.47 | 0.69 | 1.00 | -0.31 | 0.66 | -0.34 |
| Pres | -0.41 | -0.28 | -0.57 | -0.31 | 1.00 | -0.09 | -0.27 |
| CO2  | 0.18 | 0.54 | 0.16 | 0.66 | -0.09 | 1.00 | -0.39 |
| Day  | 0.76 | 0.63 | -0.64 | -0.34 | -0.27 | -0.39 | 1.00 |

## Correlation interpretation

- Outdoor temperature and indoor temperature are strongly aligned because the indoor model reuses the lagged outdoor curve.
- Outdoor temperature and outdoor humidity are strongly negative because humidity falls as ambient temperature rises.
- Pressure and outdoor humidity are moderately negative because pressure fronts shift the weather baseline.
- Daylight and outdoor temperature show a strong positive relation, but the best lag is usually not zero.
- CO2 and indoor humidity rise together during occupancy peaks.

## Lead-lag and causality examples

- Outdoor temperature typically leads indoor temperature by 5 to 8 minutes with a higher lagged correlation than the zero-lag baseline.
- Daylight typically leads outdoor temperature by 3 to 6 minutes on clear periods.
- The causality text items use a heuristic score equal to the lagged-correlation improvement over the zero-lag correlation.
- Scores above 0.08 are presented as directional signals; lower scores are reported as no strong directional signal.

## Trend analysis example

Representative outputs after warm-up:

- Outdoor temperature slope: about 0.030 to 0.045 degC per minute.
- Outdoor temperature trend direction: UP during late-morning heating, DOWN after sunset, STABLE overnight.
- Outdoor temperature forecast plus 60 minutes: usually 1.5 to 2.5 degC above the current value during the morning ramp.
- Barometric pressure slope: often between -0.010 and 0.020 hPa per minute.
- Barometric pressure trend direction: usually STABLE unless a front transition is underway.
- Change points: SHIFT_UP or SHIFT_DOWN only when the last 20-sample segment clearly departs from the previous segment.

## Dashboard behavior

- The first 8 samples are enough for an initial matrix view.
- The first 20 samples activate meaningful change-point checks.
- The first 45 samples activate stable linear-regression trends.
- The first 60 samples fill the complete correlation and percentile windows.

## Deliverable coverage

This repository now contains:

- Sensor simulation rules for seven virtual sensors.
- Analytics rules for rolling statistics, correlation, lag detection, causality heuristics, trends, and forecasts.
- Sitemap charts and textual matrix visualization.
- Results documentation for the expected analytics outputs.
