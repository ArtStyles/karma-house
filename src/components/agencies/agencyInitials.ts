/** An agency without a logo shows its initials in Calistoga inside a cream arch. */
export const agencyInitials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => [...part][0]).join('').toLocaleUpperCase('es') || '·';
