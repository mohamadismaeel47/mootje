import fs from 'node:fs';
import { config } from './config.js';
import { createApp } from './app.js';
import { migrate } from './db/migrate.js';
import { logger } from './utils/logger.js';

async function main() {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  await migrate();
  const app = createApp();
  app.listen(config.port, () => {
    logger.info(`Recruitment CRM server running on port ${config.port}`);
    if (!config.publicUrl) logger.warn('PUBLIC_URL is not set. Set it to your public https address so the webhook URL is shown correctly.');
  });
}

main().catch((err) => {
  logger.error('Server failed to start', { error: err.message });
  process.exit(1);
});
