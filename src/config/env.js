import dotenv from 'dotenv';

dotenv.config();

const required = (key, defaultValue = undefined) => {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 4000,
  MONGO_URI: required('MONGO_URI'),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  EMAIL_FROM: required('EMAIL_FROM'),
  RESEND_API_KEY: required('RESEND_API_KEY')
};
