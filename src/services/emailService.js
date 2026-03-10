import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: Number(env.SMTP_PORT),
  secure: Number(env.SMTP_PORT) === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

/**
 * Send an email with an attached invoice PDF.
 *
 * @param {string} toEmail     - Recipient email address
 * @param {string} subject     - Email subject
 * @param {string} text        - Plain-text email body
 * @param {Buffer} pdfBuffer   - PDF file content as a Buffer
 * @param {string} [filename]  - Optional attachment filename (default: invoice.pdf)
 * @returns {Promise<object>}  - Nodemailer send result
 */
export async function sendInvoiceEmail(toEmail, subject, text, pdfBuffer, filename = 'invoice.pdf') {
  logger.info('Sending invoice email', { to: toEmail, subject });

  try {
    const info = await transporter.sendMail({
      from: env.EMAIL_FROM,
      to: toEmail,
      subject,
      text,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    logger.info('Invoice email sent', { to: toEmail, messageId: info.messageId });
    return info;
  } catch (err) {
    logger.error('Failed to send invoice email', { to: toEmail, subject, error: err.message });
    throw err;
  }
}
