export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly correlationId: string,
  ) {
    super(message);
  }
}
