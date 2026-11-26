import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
});
export type CreateProjectDto = z.infer<typeof createProjectSchema>;

export const addMemberSchema = z.object({
  email: z.email(),
  role: z.enum(['admin', 'member']).default('member'),
});
export type AddMemberDto = z.infer<typeof addMemberSchema>;
