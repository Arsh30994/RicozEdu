import { randomUUID } from 'crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthContext, TenantContext } from './models';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export type ApiRequest = Request & {
  auth?: AuthContext;
  tenant?: TenantContext;
  correlationId: string;
};

type AsyncController = (
  request: ApiRequest,
  response: Response,
  next: NextFunction,
) => Promise<unknown>;

export function asyncRoute(controller: AsyncController): RequestHandler {
  return (request, response, next) => {
    void controller(request as ApiRequest, response, next).catch(next);
  };
}

export const correlationId: RequestHandler = (request, response, next) => {
  const supplied = request.header('x-correlation-id');
  const id = supplied && /^[A-Za-z0-9._-]{1,100}$/.test(supplied) ? supplied : randomUUID();
  (request as ApiRequest).correlationId = id;
  response.setHeader('X-Correlation-Id', id);
  next();
};

export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction,
): void {
  const apiRequest = request as ApiRequest;
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred.';
  let details: unknown;

  if (error instanceof HttpError) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (typeof error === 'object' && error !== null && 'issues' in error && Array.isArray(error.issues)) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed.';
    details = error.issues.map((issue: { path?: unknown; message?: unknown }) => ({
      path: Array.isArray(issue.path) ? issue.path.join('.') : '',
      message: typeof issue.message === 'string' ? issue.message : 'Invalid value',
    }));
  } else if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
    status = 409;
    code = 'DUPLICATE_RESOURCE';
    message = 'A resource with the same unique value already exists.';
  } else if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'CastError') {
    status = 400;
    code = 'INVALID_ID';
    message = 'The supplied resource ID is invalid.';
  } else if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'ValidationError') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'The submitted data is invalid.';
  } else if (error instanceof SyntaxError && 'body' in error) {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body must contain valid JSON.';
  } else {
    console.error('Unhandled API error', {
      correlationId: apiRequest.correlationId,
      error,
    });
  }

  if (response.headersSent) return;
  response.status(status).json({
    message,
    code,
    ...(details === undefined ? {} : { details }),
    correlationId: apiRequest.correlationId,
  });
}
