// Start the gateway service: node <repo>/node_modules/.pnpm/vite-node@*/node_modules/vite-node/vite-node.mjs packages/gateway/src/main.ts
import { startServer } from './server.js';

startServer();
console.log(`SabiTori gateway listening on ${process.env.PORT ?? 8080}`);
