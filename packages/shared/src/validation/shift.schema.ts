import { z } from 'zod';

export const odooShiftPayloadSchema = z.object({
  _action: z.string().optional(),
  _id: z.number().optional(),
  _model: z.string().optional(),
  id: z.number().optional(),
  company_id: z.number(),
  start_datetime: z.string().optional(),
  end_datetime: z.string().optional(),
  x_employee_avatar: z.string().optional(),
  x_employee_contact_name: z.string().optional(),
  x_interim_form_id: z.union([z.number(), z.literal(false)]).optional(),
  x_role_color: z.number().optional(),
  x_role_name: z.string().optional(),
  x_website_id: z.string().optional(),
}).superRefine((data, ctx) => {
  const action = String(data._action ?? '').toLowerCase();
  const isDeleteAction = action.includes('delete');

  if (isDeleteAction) {
    if (typeof data.id !== 'number' && typeof data._id !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['id'],
        message: 'Delete action requires id or _id',
      });
    }
    return;
  }

  const requiredFields: Array<keyof typeof data> = [
    'id',
    'start_datetime',
    'end_datetime',
    'x_employee_contact_name',
    'x_role_color',
    'x_role_name',
  ];

  for (const field of requiredFields) {
    const value = data[field];
    if (value === undefined || value === null || value === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} is required`,
      });
    }
  }
});

export type OdooShiftPayloadInput = z.infer<typeof odooShiftPayloadSchema>;
