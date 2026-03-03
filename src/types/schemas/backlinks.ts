import { z } from "zod";

export const backlinksSearchSchema = z.object({
  domain: z.string().optional().catch(""),
  subdomains: z.boolean().optional().catch(true),
  sort: z.enum(["domainRank", "pageRank", "firstSeen"]).optional().catch("domainRank"),
  order: z.enum(["asc", "desc"]).optional().catch("desc"),
  search: z.string().optional().catch(""),
});

export type BacklinksSearch = z.infer<typeof backlinksSearchSchema>;
