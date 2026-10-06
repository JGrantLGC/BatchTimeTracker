/**
 * Keeps internal database detail out of the interface.
 *
 * Provider errors carry table names, column names, constraint names and policy
 * structure. Those are useful to a developer in the console and useful to an
 * attacker on screen, so they are logged, never rendered.
 */
export function reportDbError(context: string, error: unknown): string {
  console.error(`${context}:`, error);
  return `${context}. Please try again.`;
}
