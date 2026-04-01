// parses "MM/DD@HH" → Date
// used for Ruins and Altar which need a specific hour
export function parseEventDateTime(input: string, year = new Date().getUTCFullYear()): Date | null {
	// expected format: MM/DD@HH
	const match = input.trim().match(/^(\d{1,2})\/(\d{1,2})\s*@\s*(\d{1,2})$/);
	if (!match) return null;

	const [, mm, dd, hh] = match.map(Number);

	if (mm < 1 || mm > 12) return null;
	if (dd < 1 || dd > 31) return null;
	if (hh < 0 || hh > 23) return null;

	const pad = (n: number) => String(n).padStart(2, "0");
	const date = new Date(`${year}-${pad(mm)}-${pad(dd)}T${pad(hh)}:00:00Z`);

	// catch JS date rollover e.g. Feb 31 silently becoming Mar 3
	if (date.getUTCMonth() + 1 !== mm) return null;

	return date;
}

// parses "MM/DD" → Date at 00:00 UTC
// used for Kau Karuak which always starts at midnight
export function parseEventDate(input: string, year = new Date().getUTCFullYear()): Date | null {
	// expected format: MM/DD
	const match = input.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
	if (!match) return null;

	const [, mm, dd] = match.map(Number);

	if (mm < 1 || mm > 12) return null;
	if (dd < 1 || dd > 31) return null;

	const pad = (n: number) => String(n).padStart(2, "0");
	const date = new Date(`${year}-${pad(mm)}-${pad(dd)}T00:00:00Z`);

	if (date.getUTCMonth() + 1 !== mm) return null;

	return date;
}

// helper used in scheduler and activity tracker
export function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setUTCDate(result.getUTCDate() + days);
	return result;
}

export function startOfDay(date: Date): Date {
	const d = new Date(date);
	d.setUTCHours(0, 0, 0, 0);
	return d;
}
