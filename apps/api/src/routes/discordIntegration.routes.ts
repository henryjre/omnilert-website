import { Router } from 'express';
import { updateUserDiscordIdSchema } from '@omnilert/shared';
import { authenticateDiscordBot } from '../middleware/discordBotAuth.js';
import { validateBody } from '../middleware/validateRequest.js';
import * as discordIntegrationController from '../controllers/discordIntegration.controller.js';

const router = Router();

router.use(authenticateDiscordBot);

router.get('/users', discordIntegrationController.listUsers);
router.get('/users/lookup', discordIntegrationController.lookupUser);
router.get('/registration-requests/status', discordIntegrationController.getRegistrationStatus);
router.post(
  '/users/discord-id',
  validateBody(updateUserDiscordIdSchema),
  discordIntegrationController.updateUserDiscordId,
);

export default router;
