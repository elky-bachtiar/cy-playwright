import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      rateLimit?: {
        limit: number;
        current: number;
        remaining: number;
        resetTime: Date;
      };
    }
  }
}