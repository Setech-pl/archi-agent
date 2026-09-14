---
diagram_name: telemetry-command-flow
flow_name: Telemetry command flow
author: Space Mission Sample Team
language: en
---
The Flight Controller prepares a command in Mission Control and submits it synchronously.
Mission Control sends the command request to the Command Service over its REST API and waits for the answer.
The Command Service validates the command and publishes it asynchronously to the Uplink Queue.
The Command Queue forwards the queued command asynchronously to the Orbital Relay during the next uplink window.
The Relay returns telemetry frames asynchronously to the Telemetry Service.
The Telemetry Service stores the decoded telemetry synchronously in the TLM Store.
