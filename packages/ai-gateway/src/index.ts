import { ModelError, type ModelProvider, type ModelRequest, type ModelResponse } from "@accelerate/ai-core";

export interface Route {
  readonly provider: ModelProvider;
  readonly model: string;
}

export class ModelGateway implements ModelProvider {
  constructor(private readonly routes: ReadonlyMap<string, readonly Route[]>) {}

  async supportsStructuredOutput(model: string) {
    for (const route of this.routes.get(model) ?? []) {
      if (await route.provider.supportsStructuredOutput?.(route.model)) return true;
    }
    return false;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const routes = this.routes.get(request.model);
    if (!routes?.length) throw new ModelError("Unknown model route");
    for (let index = 0; index < routes.length; index++) {
      request.signal?.throwIfAborted();
      const route = routes[index];
      try {
        if (!request.structuredOutput) return await route.provider.generate({ ...request, model: route.model });
        const native = await route.provider.supportsStructuredOutput?.(route.model);
        const { structuredOutput, ...fallback } = request;
        const response = await route.provider.generate({
          ...fallback, model: route.model, ...(native ? { structuredOutput } : {}),
        });
        return { ...response, structuredOutputMode: response.structuredOutputMode ?? (native ? "native" : "prompt") };
      } catch (error) {
        request.signal?.throwIfAborted();
        if (!(error instanceof ModelError && error.retryable) || index === routes.length - 1) throw error;
      }
    }
    throw new ModelError("No route available");
  }
}
