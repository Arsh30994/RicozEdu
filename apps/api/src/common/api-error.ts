import { HttpException, HttpStatus } from '@nestjs/common';

export class ApiError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export function rejectBodyTenantId(body: unknown): void {
  if (
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.prototype.hasOwnProperty.call(body, 'tenantId')
  ) {
    throw new ApiError(
      'TENANT_ID_IN_BODY',
      'tenantId must not be supplied in the request body',
      HttpStatus.BAD_REQUEST,
    );
  }
}
