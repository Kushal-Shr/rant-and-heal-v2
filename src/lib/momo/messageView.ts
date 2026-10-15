/** Keep local turns visible until encrypted snapshots catch up, deduplicating by ID. */
export function mergeMomoMessages<T extends { id: string; order: number }>(saved: T[], local: T[]): T[] {
  const byId = new Map(local.map((message) => [message.id, message]));
  for (const message of saved) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
