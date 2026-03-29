import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

type TokenResolver = () => string | undefined;

function readConfiguredDiscordBotToken(): string | undefined {
  const token = env.DISCORD_BOT_API_TOKEN?.trim();
  return token && token.length > 0 ? token : undefined;
}

function extractBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader?.startsWith('Bearer ')) return undefined;
  const token = authorizationHeader.slice(7).trim();
  return token.length > 0 ? token : undefined;
}

function tokensMatch(providedToken: string, expectedToken: string): boolean {
  const provided = Buffer.from(providedToken);
  const expected = Buffer.from(expectedToken);

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export function createDiscordBotAuthMiddleware(
  resolveExpectedToken: TokenResolver = readConfiguredDiscordBotToken,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const expectedToken = resolveExpectedToken();
    if (!expectedToken) {
      res.status(503).json({
        success: false,
        error: 'Discord integration token is not configured',
      });
      return;
    }

    const providedToken = extractBearerToken(req.headers.authorization);
    if (!providedToken || !tokensMatch(providedToken, expectedToken)) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
      return;
    }

    next();
  };
}

export const authenticateDiscordBot = createDiscordBotAuthMiddleware();
