// "Peña  Santos" -> "pena santos": lowercase, accents removed, runs of spaces collapsed.
// NFD splits "ñ" into "n" plus a combining mark; the regex drops the marks.
export function normalizeName(name: string): string {
    return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// "+63 917 123 4567", "0917-123-4567" and "9171234567" all become "9171234567": digits only,
// last 10. Numbers shorter than 10 digits are kept whole.
export function normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '').slice(-10);
}
