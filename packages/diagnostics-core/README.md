# @accelerate/diagnostics-core

Run named diagnostic probes concurrently with individual timeouts and sanitized results. Probes must cooperate with cancellation; a timeout cannot forcibly stop arbitrary work. Intended for on-demand diagnostics, not health endpoint routing.

See src/index.test.ts for executable usage examples.
