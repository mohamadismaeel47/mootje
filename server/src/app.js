import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requireAuth, requireClientHeader } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationRoutes from './routes/notifications.js';
import candidateRoutes from './routes/candidates.js';
import agencyRoutes from './routes/agencies.js';
import vacancyRoutes from './routes/vacancies.js';
import conversationRoutes from './routes/conversations.js';
import settingsRoutes from './routes/settings.js';
import webhookRoutes from './routes/webhook.js';
import submissionRoutes from './routes/submissions.js';
import fileRoutes from './routes/files.js';
import publicPages from './routes/public-pages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        frameSrc: ["'self'", 'blob:'],
        objectSrc: ["'self'", 'blob:'],
      },
    },
  }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  // Public privacy policy, terms and data deletion pages (needed to publish the Meta app).
  app.use(publicPages);

  // The WhatsApp webhook needs the raw request body to verify Meta's signature,
  // so it is mounted BEFORE the JSON parser.
  app.use('/api/webhooks/whatsapp', webhookRoutes);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', requireClientHeader);

  app.use('/api/auth', authRoutes);

  const api = express.Router();
  api.use(requireAuth);
  api.use('/users', userRoutes);
  api.use('/dashboard', dashboardRoutes);
  api.use('/notifications', notificationRoutes);
  api.use('/candidates', candidateRoutes);
  api.use('/agencies', agencyRoutes);
  api.use('/vacancies', vacancyRoutes);
  api.use('/conversations', conversationRoutes);
  api.use('/settings', settingsRoutes);
  api.use('/submissions', submissionRoutes);
  api.use('/files', fileRoutes);
  app.use('/api', api);
  app.use('/api', notFoundHandler);

  // Serve the built React app in production.
  const dist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
