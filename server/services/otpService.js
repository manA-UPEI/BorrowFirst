const crypto = require('crypto');
const nodemailer = require('nodemailer');

const OTP_TTL_MINUTES = 10;

function generateOtpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashOtp(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function getOtpExpiry() {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
}

function hasSmtpConfig() {
  return Boolean(
    process.env.SMTP_HOST
    && process.env.SMTP_PORT
    && process.env.SMTP_USER
    && process.env.SMTP_PASS
  );
}

function createSmtpTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendOtpEmail(email, code) {
  if (process.env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.OTP_FROM_EMAIL || 'BorrowFirst <no-reply@borrowfirst.app>',
        to: [email],
        subject: 'Your BorrowFirst verification code',
        html: `<p>Your BorrowFirst verification code is <strong>${code}</strong>.</p><p>This code expires in ${OTP_TTL_MINUTES} minutes.</p>`
      })
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Unable to send verification email. ${details}`);
    }

    return {
      deliveryMode: 'email'
    };
  }

  if (hasSmtpConfig()) {
    const transporter = createSmtpTransport();
    await transporter.sendMail({
      from: process.env.OTP_FROM_EMAIL || process.env.SMTP_USER,
      to: email,
      subject: 'Your BorrowFirst verification code',
      text: `Your BorrowFirst verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
      html: `<p>Your BorrowFirst verification code is <strong>${code}</strong>.</p><p>This code expires in ${OTP_TTL_MINUTES} minutes.</p>`
    });

    return {
      deliveryMode: 'email'
    };
  }

  throw new Error(
    'OTP email delivery is not configured. Set RESEND_API_KEY or SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and OTP_FROM_EMAIL.'
  );
}

module.exports = {
  OTP_TTL_MINUTES,
  generateOtpCode,
  hashOtp,
  getOtpExpiry,
  sendOtpEmail
};
