export interface ReconciliationSummary {
  scanned: number;
  captured: number;
  failed: number;
  unchanged: number;
  errors: string[];
  executedAt: string;
}
