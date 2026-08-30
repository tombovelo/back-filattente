export interface PaymentReportLine {
  id: number;
  amount: number;
  periodMonth: string;
  paidAt: Date | null;
  note: string | null;
}

export interface PaymentCompanyGroup {
  companyId: number;
  companyName: string;
  subtotal: number;
  payments: PaymentReportLine[];
}

export interface PaymentAgentGroup {
  agentId: number;
  agentUsername: string;
  subtotal: number;
  payments: PaymentReportLine[];
}

export interface PaymentReportPayload {
  year: number;
  month: number | null;
  total: number;
  byCompany: PaymentCompanyGroup[];
  byAgent: PaymentAgentGroup[];
}