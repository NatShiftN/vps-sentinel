export type SecurityFinding = {
  id: string;
  severity: "high" | "medium" | "low" | "info" | string;
  title: string;
  detail: string;
  recommendation: string;
};

export type AuditSection = {
  name: string;
  body: string;
};

export type SecurityAudit = {
  raw: string;
  sections: AuditSection[];
  findings: SecurityFinding[];
};
