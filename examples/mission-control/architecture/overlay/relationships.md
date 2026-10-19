# Explicit synthetic relationship metadata

| source_id | relationship_id | from_id | to_id | interface_type | interface_name | mode |
| --- | --- | --- | --- | --- | --- | --- |
| mission-control | r1 | operator | mission | INTERNAL |  | synchronous |
| mission-control | r2 | operator | planning | REST_API |  | synchronous |
| mission-control | r3 | planning | commands | REST_API |  | synchronous |
| mission-control | r4 | telemetry | archive | DB |  | synchronous |
| mission-control | r5 | telemetry | alarms | EVENT |  | asynchronous |
| mission-control | r6 | alarms | operator | EVENT |  | asynchronous |
