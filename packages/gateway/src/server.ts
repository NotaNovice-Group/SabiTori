/**
 * A small HTTP service an SMS or USSD provider calls. Provider-neutral: adapt the field names to the provider.
 *
 *   POST /sms   form or JSON { from, text }                -> 200 text/plain: the reply SMS
 *   POST /ussd  form or JSON { sessionId, phoneNumber, text } -> 200 text/plain: "CON ..." or "END ..."
 *
 * Privacy: message text and phone numbers are never written to disk or to the log. Only counts are logged.
 * Run: see src/main.ts (PORT, SABITORI_ROOT)
 */
import { createServer, type IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiskDeps } from './deps.js';
import { smsReply } from './reply.js';
import { ussd } from './ussd.js';

const MAX_BODY = 8_192;

async function body(req: IncomingMessage): Promise<Record<string, string>> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new Error('too large');
  }
  if ((req.headers['content-type'] ?? '').includes('json')) return JSON.parse(raw || '{}');
  return Object.fromEntries(new URLSearchParams(raw));
}

export function startServer(port = Number(process.env.PORT ?? 8080), root = process.env.SABITORI_ROOT ?? resolve(fileURLToPath(import.meta.url), '../../../..')) {
  const deps = createDiskDeps(root);
  let sms = 0;
  let sessions = 0;
  const server = createServer(async (req, res) => {
    const reply = (code: number, text: string) => {
      res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(text);
    };
    try {
      if (req.method === 'POST' && req.url === '/sms') {
        const b = await body(req);
        const r = await smsReply(String(b.text ?? '').slice(0, 2000), deps(), b.from ? String(b.from) : undefined);
        sms++;
        return reply(200, r.text);
      }
      if (req.method === 'POST' && req.url === '/ussd') {
        const b = await body(req);
        if (!b.text) sessions++;
        return reply(200, ussd(String(b.text ?? ''), deps().region));
      }
      if (req.method === 'GET' && req.url === '/health') return reply(200, `ok sms=${sms} ussd_sessions=${sessions}`);
      return reply(404, 'not found');
    } catch {
      return reply(400, 'bad request');
    }
  });
  server.listen(port);
  return server;
}
