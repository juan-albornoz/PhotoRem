import { buildServer } from './app.ts';
import { API_HOST, API_PORT } from './config.ts';

const app = buildServer({ logger: true });

try {
  await app.listen({ host: API_HOST, port: API_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
