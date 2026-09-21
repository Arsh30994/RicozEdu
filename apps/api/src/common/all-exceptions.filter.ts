import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { redactForLog } from './redaction';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { correlationId?: string }>();
    const correlationId =
      req.correlationId ??
      (typeof req.headers['x-correlation-id'] === 'string'
        ? req.headers['x-correlation-id']
        : randomUUID());

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'VALIDATION_ERROR';
      message = 'Request validation failed';
      details = exception.flatten();
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = HttpStatus[status] ?? 'HTTP_ERROR';
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        code = typeof b.code === 'string' ? b.code : (HttpStatus[status] ?? 'HTTP_ERROR');
        message =
          typeof b.message === 'string'
            ? b.message
            : Array.isArray(b.message)
              ? b.message.join(', ')
              : exception.message;
        details = b.details;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify(
          redactForLog({
            correlationId,
            err:
              exception instanceof Error
                ? { name: exception.name, message: exception.message, stack: exception.stack }
                : exception,
          }),
        ),
      );
    }

    res.status(status).json({
      code,
      message,
      correlationId,
      ...(details !== undefined ? { details } : {}),
    });
  }
}
