import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: Number(env.SMTP_PORT),
  secure: Number(env.SMTP_PORT) === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS
  }
});

export async function sendEmail({ to, subject, html, text }) {
  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    text,
    html
  });
}

