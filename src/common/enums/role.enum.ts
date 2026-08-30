export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  COMPANY_ADMIN: 'COMPANY_ADMIN',
  AGENT: 'AGENT',
} as const;

export type Role = (typeof Role)[keyof typeof Role];