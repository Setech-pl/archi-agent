---
diagram_name: mission-control
flow_name: Mission Control
author: Demo
language: en
---
Operator calls Mission Planning. Mission Planning synchronously calls Command Service. Telemetry synchronously writes Archive and asynchronously publishes an event to Alarms.
