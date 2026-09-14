# Systems

| id | canonical_name | kind | description |
| --- | --- | --- | --- |
| mission-control | Mission Control | system | Console application used to plan and supervise orbital operations |
| command-service | Command Service | service | Validates and sequences commands for the spacecraft |
| telemetry-service | Telemetry Service | service | Decodes and distributes spacecraft telemetry |
| telemetry-store | Telemetry Store | database | Keeps decoded telemetry for later analysis |
| command-queue | Command Queue | queue | Buffers approved commands until the next uplink window |
| orbital-relay | Orbital Relay | external | Relay satellite that forwards uplink and downlink traffic |
