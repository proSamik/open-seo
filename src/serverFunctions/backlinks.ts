import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ensureUserMiddleware } from "@/middleware/ensureUser";
import { useSessionTokenClientMiddleware } from "@every-app/sdk/tanstack";
import { BacklinkService } from "@/server/services/BacklinkService";
import { logServerError } from "@/server/lib/logger";
import { toClientError } from "@/server/lib/errors";

const backlinksInputSchema = z.object({
  target: z.string().min(1, "Domain is required"),
  includeSubdomains: z.boolean().default(true),
});

export const getBacklinksOverview = createServerFn({ method: "POST" })
  .middleware([useSessionTokenClientMiddleware, ensureUserMiddleware])
  .inputValidator((data: unknown) => backlinksInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    try {
      return await BacklinkService.getBacklinks({
        target: data.target,
        includeSubdomains: data.includeSubdomains,
      });
    } catch (error) {
      logServerError("backlinks.overview", error, {
        userId: context.userId,
        target: data.target,
      });
      throw toClientError(error);
    }
  });
