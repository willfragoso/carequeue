export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public correlationId: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ body: T; correlationId: string }> {
  const correlationId = crypto.randomUUID();
  try {
    const response = await fetch(path, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(7000)])
        : AbortSignal.timeout(7000),
      headers: {
        "Content-Type": "application/json",
        "x-correlation-id": correlationId,
        ...init.headers,
      },
    });
    const result = await response.json();
    const chosenId = response.headers.get("x-correlation-id") ?? correlationId;
    if (!response.ok)
      throw new ApiError(
        result.error?.message ?? "A API não conseguiu concluir a operação.",
        result.error?.code ?? "HTTP_ERROR",
        chosenId,
      );
    return { body: result as T, correlationId: chosenId };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (init.signal?.aborted) throw error;
    throw new ApiError(
      "Não foi possível acessar a API. Confira os serviços locais e tente novamente.",
      "CONNECTION_ERROR",
      correlationId,
    );
  }
}
