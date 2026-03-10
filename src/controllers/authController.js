import { StatusCodes } from 'http-status-codes';
import { authService } from '../services/authService.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const authController = {
  async register(req, res) {
    const result = await authService.register(req.body);
    if (result.refreshToken) {
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth/refresh-token',
        maxAge: result.refreshTokenMaxAge
      });
    }
    sendSuccess(res, StatusCodes.CREATED, {
      accessToken: result.accessToken,
      user: result.user
    });
  },

  async login(req, res) {
    const result = await authService.login(req.body);
    if (result.refreshToken) {
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth/refresh-token',
        maxAge: result.refreshTokenMaxAge
      });
    }
    sendSuccess(res, StatusCodes.OK, {
      accessToken: result.accessToken,
      user: result.user
    });
  },

  async refreshToken(req, res) {
    const token = req.cookies.refreshToken;
    const result = await authService.refreshToken(token);
    if (result.refreshToken) {
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth/refresh-token',
        maxAge: result.refreshTokenMaxAge
      });
    }
    sendSuccess(res, StatusCodes.OK, {
      accessToken: result.accessToken
    });
  },

  async logout(req, res) {
    const token = req.cookies.refreshToken;
    await authService.logout(token);
    res.clearCookie('refreshToken', {
      path: '/api/v1/auth/refresh-token'
    });
    sendSuccess(res, StatusCodes.OK, { message: 'Logged out' });
  }
};
