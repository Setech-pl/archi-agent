# Explicit synthetic relationship metadata

| source_id | relationship_id | from_id | to_id | interface_type | interface_name | mode |
| --- | --- | --- | --- | --- | --- | --- |
| retail-checkout | r1 | customer | retail | INTERNAL |  | synchronous |
| retail-checkout | r2 | customer | storefront | REST_API |  | synchronous |
| retail-checkout | r3 | storefront | orders | REST_API |  | synchronous |
| retail-checkout | r4 | orders | payments | REST_API |  | synchronous |
| retail-checkout | r5 | orders | inventory | REST_API |  | synchronous |
| retail-checkout | r6 | orders | notifications | EVENT |  | asynchronous |
