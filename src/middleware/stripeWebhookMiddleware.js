import { env } from '../config/env.js';

export function stripeWebhookMiddleware(req, res, next) {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    data += chunk;
  });
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
}
