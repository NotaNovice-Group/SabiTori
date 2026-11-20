import { handle } from './handler';
import { d1Store, r2Blobs, type D1Like, type R2Like } from './d1-store';

interface Bindings {
  DB: D1Like;
  AUDIO: R2Like;
  ALLOWED_ORIGINS?: string;
  MAX_POSTS_PER_DAY?: string;
  ADMIN_TOKEN?: string;
  RATE_SALT?: string;
}

export default {
  fetch(req: Request, b: Bindings): Promise<Response> {
    return handle(req, {
      store: d1Store(b.DB),
      blobs: r2Blobs(b.AUDIO),
      env: {
        allowedOrigins: (b.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        maxPostsPerDay: Number(b.MAX_POSTS_PER_DAY ?? 30) || 30,
        ...(b.ADMIN_TOKEN ? { adminToken: b.ADMIN_TOKEN } : {}),
        ...(b.RATE_SALT ? { rateSalt: b.RATE_SALT } : {}),
      },
    });
  },
};
