import express, { Request, Response, NextFunction } from 'express';

export interface AppOptions {
  dbHealthy: boolean;
}

export function createApp(options: AppOptions) {
  const app = express();

  app.use(express.json());

  app.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!options.dbHealthy) {
        res.status(503).json({ status: 'error', db: 'disconnected' });
        return;
      }
      res.json({ status: 'ok', db: 'connected' });
    } catch (err) {
      next(err);
    }
  });

  app.get('/error-test', (_req: Request, _res: Response, _next: NextFunction) => {
    throw new Error('Intentional test error');
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message },
    });
  });

  return app;
}
