import nodemailer from 'nodemailer';
import { env } from '@/config/env';
import { OTP_EMAIL_TEMPLATE, USERNAME_EMAIL_TEMPLATE } from '@/modules/otp/email-templates';

/**
 * Email channel for requestOtp/verifyOtp — `otpFor: 'username'` (its only
 * channel besides SMS) and `otpFor: 'password'` (an additional channel
 * alongside SMS when the account has an email on file). Mirrors
 * mindmap-api-NAS/portal/handlers/functions.js's `sendEmail` exactly: Gmail,
 * pooled, OAuth2 — not a raw SMTP username/password.
 */
export class EmailProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailProviderError';
  }
}

function isConfigured(): boolean {
  return Boolean(
    env.MAIL_USERNAME &&
      env.MAIL_PASSWORD &&
      env.OAUTH_CLIENT_ID &&
      env.OAUTH_CLIENT_SECRET &&
      env.OAUTH_CLIENT_REFRESH_TOKEN,
  );
}

function buildTransport() {
  return nodemailer.createTransport({
    pool: true,
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: env.MAIL_USERNAME,
      pass: env.MAIL_PASSWORD,
      clientId: env.OAUTH_CLIENT_ID,
      clientSecret: env.OAUTH_CLIENT_SECRET,
      refreshToken: env.OAUTH_CLIENT_REFRESH_TOKEN,
    },
  });
}

async function sendMail(to: string, subject: string, html: string): Promise<void> {
  if (!isConfigured()) {
    throw new EmailProviderError('Email is not configured (MAIL_*/OAUTH_* env vars missing)');
  }
  await buildTransport().sendMail({ from: env.MAIL_USERNAME, to, subject, html });
}

/**
 * OTP-code email — used by both otpFor purposes, distinguished only by the
 * `$otpFor` wording inside the template (matches legacy's
 * `.replace('$otpFor', 'forgot username' | 'forgot password')`).
 */
export async function sendOtpEmail(
  to: string,
  otp: string,
  purpose: 'forgot username' | 'forgot password',
): Promise<void> {
  const html = OTP_EMAIL_TEMPLATE.replace('$otpFor', purpose).replace('$otp', otp);
  const subject = purpose === 'forgot username'
    ? 'Verification code for forgot username'
    : 'Verification code for forgot password';
  await sendMail(to, subject, html);
}

/**
 * The recovered-username email itself — sent on a successful verifyOtp for
 * `verifyFor: 'username'`, matching legacy's `usernameTemplate.html` delivery
 * (the username is never returned in the API response — see otp.service.ts).
 */
export async function sendUsernameEmail(to: string, username: string): Promise<void> {
  const html = USERNAME_EMAIL_TEMPLATE.replace('$username', username);
  await sendMail(to, 'Your account credentials at Intelehealth', html);
}
