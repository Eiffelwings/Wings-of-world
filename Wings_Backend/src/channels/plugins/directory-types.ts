import type { WingsConfig } from "../../config/types.js";

export type DirectoryConfigParams = {
  cfg: WingsConfig;
  accountId?: string | null;
  query?: string | null;
  limit?: number | null;
};
