import winston from 'winston';

const enumerateErrorFormat = winston.format((info) => {
  if (info instanceof Error) {
    Object.assign(info, { message: info.message, stack: info.stack });
  }
  return info;
});

const { combine, timestamp, json, colorize, printf } = winston.format;

const consoleFormat = combine(
  colorize(),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${stack || message}${metaStr}`;
  })
);

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'http' : 'debug',
  format: combine(
    enumerateErrorFormat(),
    timestamp(),
    json()
  ),
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    ...(process.env.NODE_ENV !== 'test'
      ? [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error'
          }),
          new winston.transports.File({
            filename: 'logs/combined.log'
          })
        ]
      : [])
  ]
});

export const httpLogger = {
  stream: {
    write: (message) => logger.http(message.trim())
  }
};
