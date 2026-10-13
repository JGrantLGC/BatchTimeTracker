import { memory } from "./memory-store";
export type Department = "filling" | "kitting" | "lab operations" | "bioprocessing";
export const DEPARTMENTS: Department[] = ["filling", "kitting", "lab operations", "bioprocessing"];
export interface Operator { name: string; email: string; department?: Department; }
const DELIMITER_KEY = "barcodeDelimiter";
const OPERATOR_KEY = "currentOperator";
const SAP_REFRESH_KEY = "lastSAPRefresh";
const AUTHORIZED_USERS_KEY = "authorizedUsers";
export function getBarcodeDelimiter(): string {
  return memory.ensure<string>(DELIMITER_KEY, () => " ");
}
export function setBarcodeDelimiter(value: string) { memory.put(DELIMITER_KEY, value); }
export function getCurrentOperator(): Operator {
  return memory.ensure<Operator>(OPERATOR_KEY, () => ({
    name: "",
    email: "",
  }));
}
export function setCurrentOperator(op: Operator) { memory.put(OPERATOR_KEY, op); }
export function getLastSAPRefresh(): string {
  return memory.ensure<string>(SAP_REFRESH_KEY, () => new Date().toISOString());
}
export function setLastSAPRefresh(value: string) { memory.put(SAP_REFRESH_KEY, value); }
export function getAuthorizedUsers(): string[] {
  return memory.ensure<string[]>(AUTHORIZED_USERS_KEY, () => []);
}
export function setAuthorizedUsers(list: string[]) { memory.put(AUTHORIZED_USERS_KEY, list); }
export function isAuthorizedUser(email?: string | null): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return getAuthorizedUsers().some((e) => e.toLowerCase() === lower);
}

export function syncAuthorizedUsersFromOperators(emails: string[]): void {
  memory.put(AUTHORIZED_USERS_KEY, emails.map((e) => e.toLowerCase()).filter(Boolean));
}

const AUTHORIZED_NAMES_KEY = "authorizedOperatorNames";

/**
 * Operator sign-in collects a name and a department, never an email, so the
 * email-keyed authorized check could never match a signed-in operator. The
 * authorized operators are therefore also published by name.
 *
 * This is a convenience gate in the browser only. A typed name is not a
 * credential, so it is not a security boundary.
 */
export function syncAuthorizedOperatorNames(names: string[]): void {
  memory.put(AUTHORIZED_NAMES_KEY, names.map((n) => n.trim().toLowerCase()).filter(Boolean));
}

export function isAuthorizedOperator(name?: string | null): boolean {
  if (!name || !name.trim()) return false;
  const lower = name.trim().toLowerCase();
  return memory.ensure<string[]>(AUTHORIZED_NAMES_KEY, () => []).some((n) => n === lower);
}
