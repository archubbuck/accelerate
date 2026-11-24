# @accelerate/testing-http

FIFO HTTP transport expectations, response factories and request history. Unexpected requests fail immediately; call verify() at test teardown.

## Usage

```ts
const mock = new MockHttpTransport().expect({ method: 'GET', url: '/items', respond: () => ({ status: 200, headers: {}, body: [] }) });
await mock.send({ method: 'GET', url: '/items' });
mock.verify();
```
