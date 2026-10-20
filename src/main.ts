
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import express, { Express } from 'express';
import * as path from 'path';
import { AppModule } from './app.module';

const server: Express = express();
let isAppInitialized = false;

export async function bootstrapServer() {
  if (!isAppInitialized) {
    const app = await NestFactory.create<NestExpressApplication>(
      AppModule,
      new ExpressAdapter(server),
    );

    app.enableCors({
      origin: true,
      credentials: true,
    });

    const bodyParser = require('body-parser');
    app.use(bodyParser.json({ limit: '50mb' }));
    app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    // Static Uploads
    app.useStaticAssets(
      path.join(process.cwd(), 'uploads'),
      {
        prefix: '/uploads/',
      },
    );

    await app.init();
    isAppInitialized = true;
  }
  return server;
}

export default async function handler(req: any, res: any) {
  await bootstrapServer();
  server(req, res);
}

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 10000;
  bootstrapServer().then(() => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${port}`);
    });
  });
}