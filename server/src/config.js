import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from the repository root (one level above /server).
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const env = process.env.NODE_ENV || 'development';

function required(name, fallbackForDev) {
  const value = process.env[name];
  if (value) return value;
  if (env !== 'production' && fallbackForDev !== undefined) return fallbackForDev;
  throw new Error(`Missing required environment variable: ${name}. Run "npm run setup:env" or see .env.example.`);
}

export const config = {
  env,
  isProd: env === 'production',
  isTest: env === 'test',
  port: Number(process.env.PORT || 4000),
  // Public URL of this server, used to show the webhook URL in settings.
  publicUrl: process.env.PUBLIC_URL || '',
  databaseUrl: required('DATABASE_URL', 'postgres://crm:crm_dev_pw@localhost:5432/recruitment_crm'),
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecret: required('JWT_SECRET', env === 'production' ? undefined : 'dev-only-jwt-secret-change-me-0123456789'),
  // 32 bytes, hex encoded (64 chars). Used to encrypt WhatsApp tokens and BSN numbers at rest.
  encryptionKey: required('ENCRYPTION_KEY', env === 'production' ? undefined : '0'.repeat(64)),
  setupToken: process.env.SETUP_TOKEN || '',
  uploadDir: process.env.UPLOAD_DIR || path.resolve(__dirname, '../storage/uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  // WhatsApp values from the environment always win over values saved in the settings page.
  whatsappEnv: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || '',
  },
  smtpEnv: {
    host: process.env.SMTP_HOST || '',
    port: process.env.SMTP_PORT || '',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },
};

if (!/^[0-9a-fA-F]{64}$/.test(config.encryptionKey)) {
  throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes). Run "npm run setup:env".');
}
