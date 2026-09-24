export function isReasonablePhone(value: string) {
  if (!/^[\d+().\-\s]*(?:\s*(?:x|ext\.?|extension)\s*\d{1,8})?$/i.test(value.trim())) return false;
  const main = value.trim().split(/\s*(?:x|ext\.?|extension)\s*/i)[0];
  const digits = main.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}
