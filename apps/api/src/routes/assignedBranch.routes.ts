import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as assignedBranchController from '../controllers/assignedBranch.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', assignedBranchController.list);

export default router;
