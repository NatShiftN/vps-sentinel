export type HistorySession = {
  id: number;
  host: string;
  port: number;
  username: string;
  authMethod: string;
  startedAt: number;
  endedAt: number | null;
  status: string;
  windowLabel: string;
  outputBytes: number;
  commandCount: number;
  auditCount: number;
};

export type HistoryCommand = {
  id: number;
  ts: number;
  command: string;
  source: string;
};

export type HistoryAudit = {
  id: number;
  ts: number;
  raw: string;
  findings: Array<{
    id?: string;
    severity?: string;
    title?: string;
    detail?: string;
    recommendation?: string;
  }>;
  sections: Array<{ name?: string; body?: string }>;
};

export type HistoryDetail = {
  session: HistorySession;
  output: string;
  outputTruncated: boolean;
  commands: HistoryCommand[];
  audits: HistoryAudit[];
};

export type HistoryStats = {
  sessions: number;
  outputBytes: number;
  oldestStarted: number | null;
  path: string;
};


export type HistoryCommandSearchRow = {
  command: string;
  source: string;
  ts: number;
  sessionId: number;
  host: string;
  username: string;
  port: number;
};


export type HistoryOutputChunk = {
  ts: number;
  data: string;
};
