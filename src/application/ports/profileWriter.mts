export interface ProfileWriter {
  updateProfile(userId: number, input: {
    username: string;
    fullName: string;
    email: string;
    address: string;
    phone: string;
    country: string;
  }): Promise<void>;
  findById(userId: number): Promise<Record<string, unknown> | null>;
}

export interface ProfileValidator {
  normalizeText(value: unknown): string;
  normalizeEmail(value: unknown): string;
  validateDisplayName(value: string): string;
  validateFullName(value: string): string;
  validateEmail(value: string): boolean;
  validateContactFields(input: Record<string, unknown>): { message?: string; address?: string; phone?: string; country?: string };
}