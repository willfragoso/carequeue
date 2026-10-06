import { z } from "zod";
export const config = z
  .object({
    DATABASE_URL: z.string().min(1),
    RABBITMQ_URL: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3000),
    MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
    RETRY_DELAY_MS: z.coerce.number().int().positive().default(2000),
  })
  .parse(process.env);
