export type Attributes = Readonly<Record<string, string | number | boolean>>;
export interface Counter { add(value?: number, attributes?: Attributes): void; }
export interface Histogram { record(value: number, attributes?: Attributes): void; }
export interface Gauge { set(value: number, attributes?: Attributes): void; }
export interface Meter { counter(name: string): Counter; histogram(name: string): Histogram; gauge(name: string): Gauge; }
export function assertMetricName(name: string): string { if (!/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(name)) throw new Error('Invalid metric name'); return name; }
export function noopMeter(): Meter { return { counter: () => ({ add() {} }), histogram: () => ({ record() {} }), gauge: () => ({ set() {} }) }; }
