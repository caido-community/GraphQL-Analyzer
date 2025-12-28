export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function getDomainName(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "Unknown";
  }
}
