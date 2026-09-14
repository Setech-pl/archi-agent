# Relationships

| from_id | to_id | interface_type | interface_name | mode | purpose |
| --- | --- | --- | --- | --- | --- |
| flight-controller | mission-control | INTERNAL | Operator Console | synchronous | Submits commands and reviews telemetry |
| mission-commander | mission-control | INTERNAL | Approval Console | synchronous | Approves critical commands |
| mission-control | command-service | REST_API | Command API | synchronous | Sends command requests for validation |
| mission-control | command-service | FILE | Command Plan File | asynchronous | Uploads the daily command plan |
| command-service | mission-control | EVENT | Command Status Event | asynchronous | Reports the status of each command |
| command-service | command-queue | EVENT | Command Accepted Event | asynchronous | Publishes accepted commands for uplink |
| command-queue | orbital-relay | EVENT | Uplink Frame | asynchronous | Forwards queued commands to the relay |
| orbital-relay | telemetry-service | EVENT | Downlink Frame | asynchronous | Delivers raw telemetry frames |
| telemetry-service | telemetry-store | DB |  | synchronous | Stores decoded telemetry |
| mission-control | telemetry-service | REST_API | Telemetry Query API | synchronous | Reads current telemetry values |
