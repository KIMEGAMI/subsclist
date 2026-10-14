import { z } from "zod";

const serviceMasterIdPattern = /^[A-Za-z0-9_-]+$/;
const serviceMasterIdMaxLength = 191;

export const serviceMasterIdSchema = z
  .string()
  .min(1)
  .max(serviceMasterIdMaxLength)
  .regex(serviceMasterIdPattern);
