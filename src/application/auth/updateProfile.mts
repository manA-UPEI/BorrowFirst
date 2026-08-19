import type { ProfileValidator, ProfileWriter } from '../ports/profileWriter.mjs';

export class ProfileUpdateError extends Error {
  constructor(public readonly statusCode: 400, message: string) {
    super(message);
    this.name = 'ProfileUpdateError';
  }
}

export function createUpdateProfileUseCase(writer: ProfileWriter, validator: ProfileValidator) {
  return {
    async execute(userId: number, input: Record<string, unknown>) {
      const username = validator.normalizeText(input.username);
      const fullName = validator.normalizeText(input.fullName);
      const email = validator.normalizeEmail(input.email);
      const displayNameError = validator.validateDisplayName(username);
      const fullNameError = validator.validateFullName(fullName);
      const contact = validator.validateContactFields({
        address: input.address,
        phone: input.phone,
        country: input.country
      });
      if (displayNameError) throw new ProfileUpdateError(400, displayNameError);
      if (fullNameError) throw new ProfileUpdateError(400, fullNameError);
      if (!validator.validateEmail(email)) throw new ProfileUpdateError(400, 'Email must end with @upei.ca');
      if (contact.message) throw new ProfileUpdateError(400, contact.message);
      try {
        await writer.updateProfile(userId, {
          username, fullName, email,
          address: contact.address || '',
          phone: contact.phone || '',
          country: contact.country || ''
        });
      } catch {
        throw new ProfileUpdateError(400, 'That email is already in use');
      }
      const user = await writer.findById(userId);
      return { success: true, user };
    }
  };
}