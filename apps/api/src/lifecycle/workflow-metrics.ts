import { Injectable } from '@nestjs/common';

/** Simple process metrics (Prometheus can scrape later via exporter). */
@Injectable()
export class WorkflowMetrics {
  private readonly counters = new Map<string, number>();

  inc(name: string, workflowCode?: string, by = 1) {
    const key = workflowCode ? `${name}|${workflowCode}` : name;
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters.entries());
  }
}
