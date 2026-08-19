import { createRequire } from 'node:module';
import type { ProfileValidator, ProfileWriter } from '../../application/ports/profileWriter.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const userModel = loadLegacyModule('../../../../server/models/userModel') as Record<string, any>;
const validation = loadLegacyModule('../../../../server/services/validationService') as Record<string, any>;

export function createLegacyProfileWriter(): ProfileWriter {
  return { updateProfile: userModel.updateProfile, findById: userModel.findById };
}

export function createLegacyProfileValidator(): ProfileValidator {
  return {
    normalizeText: validation.normalizeCollapsedText,
    normalizeEmail: validation.normalizeEmail,
    validateDisplayName: validation.validateDisplayName,
    validateFullName: validation.validateFullName,
    validateEmail: validation.isValidUpeiEmail,
    validateContactFields: validation.getValidatedContactFields
  };
}