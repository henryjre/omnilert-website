import { z } from 'zod';

export const odooAttendancePayloadSchema = z.object({
  _action: z.string().optional(),
  _id: z.number().optional(),
  _model: z.string().optional(),
  id: z.number(),
  check_in: z.string(),
  check_out: z.string().optional(),
  worked_hours: z.number().optional(),
  x_company_id: z.number(),
  x_cumulative_minutes: z.number(),
  x_employee_avatar: z.string().optional(),
  x_employee_contact_name: z.string(),
  x_planning_slot_id: z.union([z.number(), z.literal(false)]),
  x_prev_attendance_id: z.union([z.number(), z.literal(false)]).optional(),
  x_shift_end: z.string().optional(),
  x_shift_start: z.string().optional(),
});

export type OdooAttendancePayloadInput = z.infer<typeof odooAttendancePayloadSchema>;
