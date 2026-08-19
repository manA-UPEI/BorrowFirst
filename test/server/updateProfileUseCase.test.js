const assert = require('node:assert/strict');
const test = require('node:test');

test('profile update use case rejects non-UPEI email before persistence', async () => {
  const { createUpdateProfileUseCase } = await import('../../dist/src/application/auth/updateProfile.mjs');
  let updated = false;
  const useCase = createUpdateProfileUseCase({
    updateProfile: async () => { updated = true; },
    findById: async () => ({})
  }, {
    normalizeText: (value) => String(value || '').trim(),
    normalizeEmail: (value) => String(value || '').trim().toLowerCase(),
    validateDisplayName: () => '',
    validateFullName: () => '',
    validateEmail: () => false,
    validateContactFields: () => ({ address: '', phone: '', country: '' })
  });
  await assert.rejects(() => useCase.execute(3, { email: 'person@example.com' }), {
    message: 'Email must end with @upei.ca'
  });
  assert.equal(updated, false);
});