let _role = "User";

export function setStoredRole(role: string): void {
  _role = role;
}

export function getStoredRole(): string {
  return _role;
}
