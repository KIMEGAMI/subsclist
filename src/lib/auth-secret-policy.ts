const placeholderPattern = /(?:^|[^a-z0-9])(?:replace|placeholder|change[_\s-]*me|your[_\s-]*secret|example[_\s-]*secret)(?:$|[^a-z0-9])/i;

export function isAuthSecretAcceptable(secret: string) {
  return secret.length >= 32 && !placeholderPattern.test(secret);
}
