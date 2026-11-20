/**
 * SMS length rules. A GSM-7 message holds 160 characters (153 per part when split); anything outside the GSM-7
 * alphabet (for example "ê", "ô", "’") switches the whole message to UCS-2: 70 characters (67 per part).
 */
const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[~]|€'; // two characters each

export function isGsm7(text: string): boolean {
  for (const ch of text) if (!GSM7.includes(ch) && !GSM7_EXT.includes(ch)) return false;
  return true;
}

/** How many SMS parts a text needs. */
export function smsParts(text: string): number {
  if (!text) return 1;
  if (isGsm7(text)) {
    let n = 0;
    for (const ch of text) n += GSM7_EXT.includes(ch) ? 2 : 1;
    return n <= 160 ? 1 : Math.ceil(n / 153);
  }
  const n = [...text].length;
  return n <= 70 ? 1 : Math.ceil(n / 67);
}

/**
 * Plain characters that keep a reply in GSM-7 (cheaper, and readable on the oldest phones): typographic quotes and
 * dashes, and the French letters GSM-7 lacks, are written with their nearest GSM-7 letter.
 */
export function toGsm7(text: string): string {
  const map: Record<string, string> = {
    '’': "'", '‘': "'", '“': '"', '”': '"', '«': '"', '»': '"', '–': '-', '—': '-', '…': '...',
    'â': 'a', 'ê': 'e', 'î': 'i', 'ô': 'o', 'û': 'u', 'ë': 'e', 'ï': 'i', 'ç': 'c', 'œ': 'oe',
    'À': 'A', 'Â': 'A', 'È': 'E', 'Ê': 'E', 'Î': 'I', 'Ô': 'O', 'Û': 'U', 'Ç': 'C',
    ' ': ' ', ' ': ' ',
  };
  return [...text].map((c) => map[c] ?? c).join('').replace(/[^\n -~£¥èéùìòÇØøÅåÄÖÑÜäöñüàÉ§¿¡]/g, '');
}
