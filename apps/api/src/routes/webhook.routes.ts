import { Router } from 'express';
import {
  odooPosVerificationPayloadSchema,
  odooPosSessionPayloadSchema,
  odooShiftPayloadSchema,
  odooAttendancePayloadSchema,
  odooDiscountOrderPayloadSchema,
  odooRefundOrderPayloadSchema,
  odooNonCashOrderPayloadSchema,
  odooTokenPayOrderPayloadSchema,
  odooISPEPurchaseOrderPayloadSchema,
  odooRegisterCashPayloadSchema,
  odooPosSessionClosePayloadSchema,
} from '@omnilert/shared';
import { validateBody } from '../middleware/validateRequest.js';
import * as webhookController from '../controllers/webhook.controller.js';

const router = Router();

// No auth — company is resolved via company_id/branchId in the payload
router.post(
  '/odoo/pos-verification',
  validateBody(odooPosVerificationPayloadSchema),
  webhookController.posVerification,
);

router.post(
  '/odoo/pos-session',
  validateBody(odooPosSessionPayloadSchema),
  webhookController.posSession,
);

router.post(
  '/odoo/employee-shift',
  validateBody(odooShiftPayloadSchema),
  webhookController.employeeShift,
);

router.post(
  '/odoo/attendance',
  validateBody(odooAttendancePayloadSchema),
  webhookController.attendance,
);

router.post(
  '/odoo/discount-order',
  validateBody(odooDiscountOrderPayloadSchema),
  webhookController.discountOrder,
);

router.post(
  '/odoo/refund-order',
  validateBody(odooRefundOrderPayloadSchema),
  webhookController.refundOrder,
);

router.post(
  '/odoo/non-cash-order',
  validateBody(odooNonCashOrderPayloadSchema),
  webhookController.nonCashOrder,
);

router.post(
  '/odoo/token-pay-order',
  validateBody(odooTokenPayOrderPayloadSchema),
  webhookController.tokenPayOrder,
);

router.post(
  '/odoo/ispe-purchase-order',
  validateBody(odooISPEPurchaseOrderPayloadSchema),
  webhookController.ispePurchaseOrder,
);

router.post(
  '/odoo/register-cash',
  validateBody(odooRegisterCashPayloadSchema),
  webhookController.registerCash,
);

router.post(
  '/odoo/pos-session-close',
  validateBody(odooPosSessionClosePayloadSchema),
  webhookController.posSessionClose,
);

export default router;
