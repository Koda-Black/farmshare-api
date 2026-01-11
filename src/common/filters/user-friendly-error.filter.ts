// ============================================================================
// FILE: src/common/filters/user-friendly-error.filter.ts
// PURPOSE: Global exception filter that provides user-friendly error messages
// ============================================================================

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  // Admin-only fields
  details?: any;
  stack?: string;
}

/**
 * User-friendly error messages for common error codes
 */
const USER_FRIENDLY_MESSAGES: Record<string, string> = {
  // Authentication errors
  'Invalid credentials':
    'The email or password you entered is incorrect. Please try again.',
  'Invalid OTP':
    'The verification code you entered is incorrect. Please check and try again.',
  'OTP expired':
    'Your verification code has expired. Please request a new one.',
  'User not found':
    "We couldn't find an account with that email. Please check or create a new account.",
  'Invalid token': 'Your session has expired. Please log in again.',
  'Token expired': 'Your session has expired. Please log in again.',

  // Payment errors
  'Payment initialization failed':
    "We couldn't process your payment. Please try again or use a different payment method.",
  'Payment initialization timeout':
    'Payment is taking longer than expected. Please try again.',
  'Invalid or already processed': 'This payment has already been processed.',
  'Not enough slots available':
    "Sorry, there aren't enough slots available. Please reduce your quantity or try another pool.",
  'Pool not found': 'This pool is no longer available.',

  // Rate limiting
  'Too many requests':
    "You've made too many requests. Please wait a moment before trying again.",
  'Too many failed attempts':
    'Too many failed attempts. Please wait before trying again.',
  'Maximum payment attempts reached':
    "You've reached the maximum payment attempts. Please try again later.",
  'Payment temporarily blocked':
    'Payments are temporarily blocked. Please try again later or contact support.',

  // Escrow errors
  'Vendor bank details not configured':
    "The vendor hasn't set up their payment details yet. Please contact support.",
  'Cannot release escrow':
    'Funds cannot be released at this time. Please contact support.',
  'Cannot release escrow with open disputes':
    "There's an open dispute that needs to be resolved first.",

  // Verification errors
  'Verification failed':
    "We couldn't verify your information. Please check your details and try again.",
  'Document upload failed':
    "We couldn't upload your document. Please try again.",

  // Generic
  'Internal server error':
    'Something went wrong on our end. Please try again later.',
  'Bad Request':
    'There was a problem with your request. Please check your information and try again.',
  Unauthorized: 'Please log in to continue.',
  Forbidden: "You don't have permission to do this.",
  'Not Found': "We couldn't find what you're looking for.",

  // Email/SMTP errors
  'Invalid login':
    'Email service is temporarily unavailable. Please try again later.',
  'Username and Password not accepted':
    'Email service configuration error. Please contact support.',
  SMTP: 'Email service is temporarily unavailable. Your account was created but verification email could not be sent.',
  'account is deleted':
    'Email service is temporarily unavailable. Please try again later.',
};

/**
 * UserFriendlyErrorFilter transforms technical errors into user-friendly messages
 * while preserving detailed information for admins/developers in logs
 */
@Catch()
export class UserFriendlyErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(UserFriendlyErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine status code
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Get the original error message
    let originalMessage = 'Internal server error';
    let errorName = 'Error';
    let details: any = null;

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        originalMessage = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        originalMessage = (exceptionResponse as any).message || originalMessage;
        errorName = (exceptionResponse as any).error || exception.name;
        details = (exceptionResponse as any).details;
      }
    } else if (exception instanceof Error) {
      originalMessage = exception.message;
      errorName = exception.name;
    }

    // Handle array of messages (from class-validator)
    if (Array.isArray(originalMessage)) {
      originalMessage = originalMessage[0];
    }

    // Get user-friendly message
    const userFriendlyMessage = this.getUserFriendlyMessage(
      originalMessage,
      status,
    );

    // Log the full error for debugging
    this.logger.error(
      `[${request.method}] ${request.url} - ${status} - ${originalMessage}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    // Determine if this is an admin/developer request
    const isAdmin = this.isAdminRequest(request);

    // Build response
    const errorResponse: ErrorResponse = {
      statusCode: status,
      message: userFriendlyMessage,
      error: this.getErrorType(status),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Add detailed info for admins
    if (isAdmin) {
      errorResponse.details = {
        originalMessage,
        errorName,
        ...(details ? { validation: details } : {}),
      };
      if (
        process.env.NODE_ENV === 'development' &&
        exception instanceof Error
      ) {
        errorResponse.stack = exception.stack;
      }
    }

    response.status(status).json(errorResponse);
  }

  /**
   * Get user-friendly message from the original error
   */
  private getUserFriendlyMessage(
    originalMessage: string,
    status: number,
  ): string {
    // Check for exact match first
    if (USER_FRIENDLY_MESSAGES[originalMessage]) {
      return USER_FRIENDLY_MESSAGES[originalMessage];
    }

    // Check for partial matches
    for (const [key, friendlyMessage] of Object.entries(
      USER_FRIENDLY_MESSAGES,
    )) {
      if (originalMessage.toLowerCase().includes(key.toLowerCase())) {
        return friendlyMessage;
      }
    }

    // Default messages based on status code
    switch (status) {
      case 400:
        return 'There was a problem with your request. Please check your information and try again.';
      case 401:
        return 'Please log in to continue.';
      case 403:
        return "You don't have permission to perform this action.";
      case 404:
        return "We couldn't find what you're looking for.";
      case 429:
        return "You've made too many requests. Please wait a moment before trying again.";
      case 500:
      default:
        return 'Something went wrong. Please try again later or contact support if the problem persists.';
    }
  }

  /**
   * Get error type name from status code
   */
  private getErrorType(status: number): string {
    switch (status) {
      case 400:
        return 'Bad Request';
      case 401:
        return 'Unauthorized';
      case 403:
        return 'Forbidden';
      case 404:
        return 'Not Found';
      case 429:
        return 'Too Many Requests';
      case 500:
        return 'Internal Server Error';
      default:
        return 'Error';
    }
  }

  /**
   * Check if this is an admin request based on user role or special header
   */
  private isAdminRequest(request: Request): boolean {
    // Check for admin role in JWT payload
    const user = (request as any).user;
    if (user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
      return true;
    }

    // Check for debug header in development
    if (process.env.NODE_ENV === 'development') {
      return request.headers['x-debug'] === 'true';
    }

    return false;
  }
}
