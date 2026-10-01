import { memory } from "./memory-store";
export interface Operator { name: string; email: string; }
const DELIMITER_KEY = "barcodeDelimiter";
const OPERATOR_KEY = "currentOperator";
const SAP_REFRESH_KEY = "lastSAPRefresh";
const AUTHORIZED_USERS_KEY = "authorizedUsers";
export function getBarcodeDelimiter(): string {
  return memory.ensure<string>(DELIMITER_KEY, () => "|");
}
export function setBarcodeDelimiter(value: string) { memory.put(DELIMITER_KEY, value); }
export function getCurrentOperator(): Operator {
  return memory.ensure<Operator>(OPERATOR_KEY, () => ({
    name: "Joseph Grant",
    email: "joseph.grant@example.com",
  }));
}
export function setCurrentOperator(op: Operator) { memory.put(OPERATOR_KEY, op); }
export function getLastSAPRefresh(): string {
  return memory.ensure<string>(SAP_REFRESH_KEY, () => "2025-09-24T06:00:00.000Z");
}
export function setLastSAPRefresh(value: string) { memory.put(SAP_REFRESH_KEY, value); }
export function getAuthorizedUsers(): string[] {
  return memory.ensure<string[]>(AUTHORIZED_USERS_KEY, () => ["joseph.grant@example.com"]);
}
export function setAuthorizedUsers(list: string[]) { memory.put(AUTHORIZED_USERS_KEY, list); }
export function isAuthorizedUser(email?: string | null): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return getAuthorizedUsers().some((e) => e.toLowerCase() === lower);
}
