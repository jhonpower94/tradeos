import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import mongoose from 'mongoose';
import { config } from './config/index.js';
import { AppError } from './utils/errors.js';
import { registerRoutes } from './routes/index.js';
import { registerGateway } from './websocket/gateway.js';
import { setNotificationBroadcast } from './modules/notifications/index.js';
import { gatewayBroadcast } from './websocket/gateway.js';
import { startMarketStreams } from './websocket/binance.js';
import { startPositionWorker } from './workers/position.worker.js';
import { startScannerWorker } from './workers/scanner.worker.js';
import { StrategyDef } from './models/StrategyDef.js';
import { strategyRegistry } from './modules/strategies/index.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.env === 'production' ? 'info' : 'debug',
    },
  });

  await app.register(cors, { origin: config.corsOrigin, credentials: true });
  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtAccessExpires },
  });
  await app.register(websocket);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        code: err.code,
        message: err.message,
        details: err.details,
      });
    }
    const anyErr = err as {
      validation?: unknown;
      message?: string;
      statusCode?: number;
      code?: string;
    };
    if (anyErr.validation) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: anyErr.message ?? 'Validation error',
      });
    }
    if (
      anyErr.statusCode === 401 ||
      anyErr.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED' ||
      anyErr.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID' ||
      anyErr.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER'
    ) {
      return reply.status(401).send({
        code: anyErr.code ?? 'UNAUTHORIZED',
        message: anyErr.message ?? 'Unauthorized',
      });
    }
    app.log.error(err);
    return reply.status(500).send({
      code: 'INTERNAL',
      message: 'Internal server error',
    });
  });

  await registerGateway(app);
  await registerRoutes(app);
  setNotificationBroadcast(gatewayBroadcast);

  return app;
}

async function seedStrategies() {
  for (const s of strategyRegistry.getAll()) {
    await StrategyDef.findOneAndUpdate(
      { id: s.id },
      {
        $set: {
          name: s.name,
          description: s.description,
          enabledByDefault: true,
          defaultParams: {},
        },
      },
      { upsert: true },
    );
  }
}

export async function start() {
  await mongoose.connect(config.mongodbUri);
  await seedStrategies();

  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });

  startMarketStreams();
  startPositionWorker();
  if (config.env !== 'test') {
    startScannerWorker();
  }

  app.log.info(`Trading OS API on http://${config.host}:${config.port}`);
  return app;
}
