function isRegistrationOtpEnabled() {
  const rawValue = typeof process.env.REGISTRATION_OTP_ENABLED === 'string'
    ? process.env.REGISTRATION_OTP_ENABLED.trim().toLowerCase()
    : '';

  if (!rawValue) {
    return true;
  }

  return !['0', 'false', 'no', 'off'].includes(rawValue);
}

module.exports = {
  isRegistrationOtpEnabled
};
