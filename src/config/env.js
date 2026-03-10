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

  // STRIPE_SECRET_KEY: required('STRIPE_SECRET_KEY'),
  // STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',

  EMAIL_FROM: required('EMAIL_FROM'),
  SMTP_HOST: required('SMTP_HOST'),
  SMTP_PORT: required('SMTP_PORT'),
  SMTP_USER: required('SMTP_USER'),
  SMTP_PASS: required('SMTP_PASS')
};
