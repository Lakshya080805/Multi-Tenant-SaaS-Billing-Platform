import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const resend = new Resend(env.RESEND_API_KEY);

/**
 * Send an email with an attached invoice PDF via Resend.
 *
 * @param {string} toEmail     - Recipient email address
 * @param {string} subject     - Email subject
 * @param {string} text        - Plain-text email body
 * @param {Buffer} pdfBuffer   - PDF file content as a Buffer
 * @param {string} [filename]  - Optional attachment filename (default: invoice.pdf)
 * @returns {Promise<object>}  - Resend send result
 */
export async function sendInvoiceEmail(toEmail, subject, text, pdfBuffer, filename = 'invoice.pdf') {
  logger.info('Sending invoice email', { to: toEmail, subject });

  try {
    const { data, error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: toEmail,
      subject,
      text,
      attachments: [
        {
          filename,
          content: pdfBuffer.toString('base64'),
        },
      ],
    });

    if (error) {
      throw new Error(error.message);
    }

    logger.info('Invoice email sent', { to: toEmail, id: data.id });
    return data;
  } catch (err) {
    logger.error('Failed to send invoice email', { to: toEmail, subject, error: err.message });
    throw err;
  }
}
