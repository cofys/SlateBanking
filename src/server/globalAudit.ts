import { db } from "../db/index";
import { globalAuditLogs } from "../db/schema";
import { v4 as uuidv4 } from "uuid";

interface LogEntry {
  discordId?: string | null;
  action: string;
  details?: string | null;
  ipAddress?: string | null;
  route?: string | null;
  method?: string | null;
  bankId?: string | null;
  latencyMs?: number | null;
  timestamp: Date;
}

class GlobalAuditManager {
  private buffer: LogEntry[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL = 2000; // 2 seconds
  private readonly MAX_BUFFER_SIZE = 500;

  public log(entry: Omit<LogEntry, "timestamp">) {
    this.buffer.push({ ...entry, timestamp: new Date() });
    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL);
    }
  }

  private async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    if (this.buffer.length === 0) return;
    
    const entriesToFlush = this.buffer.splice(0, this.MAX_BUFFER_SIZE);
    
    try {
      const records = entriesToFlush.map(entry => ({
        id: uuidv4(),
        discordId: entry.discordId || null,
        action: entry.action,
        details: entry.details || null,
        ipAddress: entry.ipAddress || null,
        route: entry.route || null,
        method: entry.method || null,
        bankId: entry.bankId || null,
        latencyMs: entry.latencyMs || null,
        timestamp: entry.timestamp,
      }));
      
      db.insert(globalAuditLogs).values(records).run();
    } catch (e) {
      console.error("[GlobalAuditManager] Failed to flush logs", e);
    }
  }
}

export const globalAudit = new GlobalAuditManager();
