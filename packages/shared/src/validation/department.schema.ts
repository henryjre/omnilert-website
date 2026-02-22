import { z } from 'zod';

const uuid = z.string().uuid();

export const upsertDepartmentSchema = z.object({
  name: z.string().trim().min(1, 'Department name is required').max(255, 'Department name is too long'),
  headUserId: uuid.nullable().optional(),
  memberUserIds: z.array(uuid).default([]),
});

export type UpsertDepartmentInput = z.infer<typeof upsertDepartmentSchema>;
