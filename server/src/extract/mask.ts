export interface MaskMember {
  id: string;
  name: string;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const PHONE = /(?:\+82[-.\s]?)?\(?0\d{1,2}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g;
const DIGIT_GROUPS = /\d{2,6}(?:[- ]\d{2,6}){2,5}/g;
const LONG_DIGITS = /\d{10,}/g;
const HANGUL = /^[가-힣]+$/;
const HONORIFIC = '(?:\\s*(?:씨|님))?';
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const digitCount = (value: string) => value.replace(/\D/g, '').length;

export function maskPersonalNumbers(text: string): string {
  return text
    .replace(EMAIL, '[이메일]')
    .replace(PHONE, '[전화]')
    .replace(DIGIT_GROUPS, (match) => (digitCount(match) >= 10 ? '[계좌]' : match))
    .replace(LONG_DIGITS, '[계좌]');
}

/** Name forms to hide: full name, and the given name (without the surname) of 3+ syllable Korean names. */
function nameForms(name: string): string[] {
  const full = name.trim();
  if (full.length < 2) return [];
  const forms = [full];
  if (HANGUL.test(full) && full.length >= 3) forms.push(full.slice(1));
  return forms;
}

export function maskMemberNames(text: string, members: MaskMember[]): string {
  const forms = members
    .flatMap((member) => nameForms(member.name).map((form) => ({ form, id: member.id })))
    .sort((a, b) => b.form.length - a.form.length);
  let masked = text;
  for (const { form, id } of forms) {
    const latin = /^[A-Za-z .'-]+$/.test(form);
    const pattern = latin
      ? new RegExp(`(?<![A-Za-z])${escape(form)}(?![A-Za-z])${HONORIFIC}`, 'gi')
      : new RegExp(`${escape(form)}${HONORIFIC}`, 'g');
    masked = masked.replace(pattern, `@${id}`);
  }
  return masked;
}

/** Hides numbers/emails first, then member names (replaced by @<id>). Pure. */
export function maskText(text: string, members: MaskMember[]): string {
  return maskMemberNames(maskPersonalNumbers(text), members);
}
