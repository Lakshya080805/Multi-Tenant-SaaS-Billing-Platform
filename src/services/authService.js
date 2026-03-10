import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { jwtUtils } from '../utils/jwt.js';
import { userModel } from '../models/userModel.js';
import { organizationModel } from '../models/organizationModel.js';
import { refreshTokenModel } from '../models/refreshTokenModel.js';
import { ApiError } from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';

const ALLOWED_ROLES = ['admin', 'accountant', 'viewer'];

export const authService = {
  async register({ email, password, organizationName, role }) {
    const existing = await userModel.findByEmail(email);
    if (existing) {
      throw new ApiError(StatusCodes.CONFLICT, 'Email already in use');
    }

    const org = await organizationModel.create({
      id: uuid(),
      name: organizationName
    });

    const passwordHash = await bcrypt.hash(password, 10);

    const normalizedRole = ALLOWED_ROLES.includes(role) ? role : 'admin';

    const user = await userModel.create({
      id: uuid(),
      email,
      passwordHash,
      role: normalizedRole,
      organizationId: org.id
    });

    const tokens = jwtUtils.issueAuthTokens({
      userId: user.id,
      organizationId: org.id,
      role: user.role
    });

    await refreshTokenModel.storeToken({
      userId: user.id,
      tokenId: tokens.refreshTokenId
    });

    return {
      user: { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      refreshTokenMaxAge: tokens.refreshTokenMaxAge
    };
  },

  async login({ email, password }) {
    const user = await userModel.findByEmail(email);
    if (!user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid credentials');
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid credentials');
    }

    const tokens = jwtUtils.issueAuthTokens({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role
    });

    await refreshTokenModel.storeToken({
      userId: user.id,
      tokenId: tokens.refreshTokenId
    });

    return {
      user: { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      refreshTokenMaxAge: tokens.refreshTokenMaxAge
    };
  },

  async refreshToken(refreshToken) {
    if (!refreshToken) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Missing refresh token');
    }

    const payload = jwtUtils.verifyRefreshToken(refreshToken);
    const { sub: userId, jti } = payload;

    const user = await userModel.findById(userId);
    if (!user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'User not found');
    }

    const isValid = await refreshTokenModel.isTokenValid({
      userId,
      tokenId: jti
    });

    if (!isValid) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Refresh token invalidated');
    }

    await refreshTokenModel.revokeUserTokens(userId);

    const tokens = jwtUtils.issueAuthTokens({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role
    });

    await refreshTokenModel.storeToken({
      userId: user.id,
      tokenId: tokens.refreshTokenId
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      refreshTokenMaxAge: tokens.refreshTokenMaxAge
    };
  },

  async logout(refreshToken) {
    if (!refreshToken) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Missing refresh token');
    }

    const payload = jwtUtils.verifyRefreshToken(refreshToken);
    const { sub: userId } = payload;

    await refreshTokenModel.revokeUserTokens(userId);
  }
};
