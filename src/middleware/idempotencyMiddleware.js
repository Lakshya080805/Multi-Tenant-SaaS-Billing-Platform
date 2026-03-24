import { StatusCodes } from 'http-status-codes';
import { ApiError } from '../utils/ApiError.js';
import {
  buildIdempotencyStorageKey,
  buildRequestFingerprint,
  getIdempotencyResult,
  setIdempotencyResult
} from '../services/paymentSafetyService.js';

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

function getIdempotencyHeaderValue(req) {
  const primary = req.get('Idempotency-Key');
  if (primary) {
    return primary;
  }

  return req.get('X-Idempotency-Key');
}

export function paymentIdempotencyMiddleware(options = {}) {
  const scope = options.scope || 'payment';
  const ttlSeconds = Number(options.ttlSeconds) || DEFAULT_TTL_SECONDS;
  const required = options.required === true;

  return async (req, res, next) => {
    const idempotencyKey = getIdempotencyHeaderValue(req);

    if (!idempotencyKey) {
      if (required) {
        return next(new ApiError(StatusCodes.BAD_REQUEST, 'Idempotency-Key header is required'));
      }
      return next();
    }

    const organizationId = req.user?.organizationId || 'anonymous';
    const requestFingerprint = buildRequestFingerprint({
      method: req.method,
      scope,
      body: req.body,
      params: req.params,
      query: req.query
    });

    const storageKey = buildIdempotencyStorageKey({
      organizationId,
      scope,
      idempotencyKey
    });

    const existing = await getIdempotencyResult(storageKey);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        return next(
          new ApiError(
            StatusCodes.CONFLICT,
            'Idempotency key reuse detected with a different request payload'
          )
        );
      }

      res.set('Idempotency-Replayed', 'true');
      return res.status(existing.statusCode).json(existing.payload);
    }

    let responseStatus = 200;
    const originalStatus = res.status.bind(res);
    const originalJson = res.json.bind(res);

    res.status = (code) => {
      responseStatus = code;
      return originalStatus(code);
    };

    res.json = (payload) => {
      if (responseStatus >= 200 && responseStatus < 300) {
        setIdempotencyResult(
          storageKey,
          {
            statusCode: responseStatus,
            payload,
            requestFingerprint,
            createdAt: new Date().toISOString()
          },
          ttlSeconds
        ).catch(() => {
          // Best effort persistence. Request should still complete successfully.
        });
      }

      return originalJson(payload);
    };

    return next();
  };
}
