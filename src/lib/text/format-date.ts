// Deterministic, SSR-safe date formatting helpers.
// Always formats using UTC to avoid locale/timezone hydration mismatches.

export function formatDateUTC(iso: string | number | Date): string {
    const d = new Date(iso);
    // YYYY-MM-DD
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function formatDateTimeUTC(iso: string | number | Date): string {
    const d = new Date(iso);
    // YYYY-MM-DD HH:MM:SS (UTC)
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} UTC`;
}

export function formatTimeAgoUTC(iso: string | number | Date): string {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diff = Math.max(0, now - then);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return 'just now';
    if (diff < hour) {
        const m = Math.round(diff / minute);
        return `${m} min ago`;
    }
    if (diff < day) {
        const h = Math.round(diff / hour);
        return `${h} hr ago`;
    }
    const dcount = Math.round(diff / day);
    return `${dcount} d ago`;
}


