"use client";

import { useState } from 'react';

export default function EloClient() {
    const [value, setValue] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ok, setOk] = useState(false);

    const submit = async () => {
        setLoading(true);
        setError(null);
        setOk(false);
        try {
            const num = Number(value);
            if (!Number.isFinite(num) || num < 0) {
                throw new Error('Please enter a valid non-negative number');
            }
            const res = await fetch('/api/admin/elo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ elo: Math.round(num) }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to update Elo');
            setOk(true);
        } catch (e: any) {
            setError(e?.message || 'Failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <p className="text-neutral-400 text-sm">Set your exact Elo. This updates your rank and leaderboard placements immediately.</p>
            <div className="flex items-center gap-3">
                <input
                    type="number"
                    className="input max-w-[160px]"
                    placeholder="e.g. 1350"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                />
                <button onClick={submit} disabled={loading} className="btn-primary px-4 py-2">
                    {loading ? 'Updating…' : 'Update Elo'}
                </button>
            </div>
            {error && <div className="text-sm text-red-400">{error}</div>}
            {ok && <div className="text-sm text-green-400">Updated. You may need to refresh affected pages.</div>}
        </div>
    );
}


