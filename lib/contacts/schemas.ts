import { z } from "zod";
import { emailSchema, personNameSchema } from "@/lib/validation/common";

export const contactSchema = z.object({
  firstName: personNameSchema(80),
  lastName: personNameSchema(120),
  email: emailSchema,
});

export type ContactInput = z.infer<typeof contactSchema>;
