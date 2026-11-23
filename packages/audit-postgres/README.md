# @accelerate/audit-postgres

PostgreSQL audit store backed by `@accelerate/data-core`. Apply `schema.sql` through your migration system. The API exposes append and filtered reads only; enforce append-only database privileges separately for tamper resistance.
