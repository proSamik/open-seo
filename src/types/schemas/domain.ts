import { z } from "zod";

export const domainOverviewSchema = z.object({
  domain: z.string().min(1, "Domain is required").max(255),
  includeSubdomains: z.boolean().default(true),
  locationCode: z.number().int().positive().default(2840),
  languageCode: z.string().min(2).max(8).default("en"),
});

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/domain                  */
/* ------------------------------------------------------------------ */

const domainSortModes = ["rank", "traffic", "volume"] as const;
const domainSortOrders = ["asc", "desc"] as const;
const domainTabs = ["keywords", "pages"] as const;

export const domainSearchSchema = z.object({
  domain: z.string().optional(),
  subdomains: z.coerce.boolean().optional(),
  sort: z.enum(domainSortModes).optional(),
  order: z.enum(domainSortOrders).optional(),
  tab: z.enum(domainTabs).optional(),
  search: z.string().optional(),
  minVol: z.string().optional(),
  maxVol: z.string().optional(),
  minKd: z.string().optional(),
  maxKd: z.string().optional(),
});
