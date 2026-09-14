# Rules

| rule | from_id | to_id | reason |
| --- | --- | --- | --- |
| forbid | flight-controller | orbital-relay | Commands must be validated by the command service before uplink |
| require | command-service | command-queue | Every accepted command is queued for the next uplink window |
