import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { env } from '../config/env.js';

function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN
  });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

export const jwtUtils = {
  issueAuthTokens({ userId, organizationId, role }) {
    const accessToken = signAccessToken({
      sub: userId,
      org: organizationId,
      role
    });

    const refreshTokenId = uuid();
    const refreshToken = signRefreshToken({
      sub: userId,
      jti: refreshTokenId
    });

    const refreshTokenMaxAgeMs = 7 * 24 * 60 * 60 * 1000;

    return {
      accessToken,
      refreshToken,
      refreshTokenId,
      refreshTokenMaxAge: refreshTokenMaxAgeMs
    };
  },
  verifyAccessToken,
  verifyRefreshToken
};

