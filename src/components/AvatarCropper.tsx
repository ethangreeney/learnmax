'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area } from 'react-easy-crop';

type AvatarCropperProps = {
    src: string;
    onCancel: () => void;
    onCropped: (file: File) => void;
    aspect?: number;
    outputSize?: number;
    quality?: number; // 0..1
    filename?: string;
    mode?: 'static' | 'gif';
    onGifCrop?: (area: Area) => Promise<void>;
};

export default function AvatarCropper({
    src,
    onCancel,
    onCropped,
    aspect = 1,
    outputSize = 512,
    quality = 0.9,
    filename = 'avatar.webp',
    mode = 'static',
    onGifCrop,
}: AvatarCropperProps) {
    const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState<number>(1);
    const [areaPx, setAreaPx] = useState<Area | null>(null);
    const [busy, setBusy] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    const onComplete = useCallback((_area: Area, areaPixels: Area) => {
        setAreaPx(areaPixels);
    }, []);

    const doCrop = useCallback(async () => {
        if (!areaPx) return;
        if (busy) return;
        setBusy(true);
        try {
            if (mode === 'gif' && onGifCrop) {
                await onGifCrop(areaPx);
            } else {
                const file = await cropToWebp(src, areaPx, outputSize, quality, filename);
                onCropped(file);
            }
        } finally {
            setBusy(false);
        }
    }, [areaPx, filename, mode, onCropped, onGifCrop, outputSize, quality, src]);

    const overlay = (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
                <div className="relative h-[60vh] min-h-[360px]">
                    <Cropper
                        image={src}
                        crop={crop}
                        zoom={zoom}
                        aspect={aspect}
                        cropShape="round"
                        showGrid={false}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onComplete}
                        objectFit="cover"
                        restrictPosition
                    />
                </div>
                <div className="flex items-center justify-between gap-4 p-4">
                    <div className="flex items-center gap-3">
                        <label className="text-xs text-neutral-400">Zoom</label>
                        <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.01}
                            value={zoom}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="w-48"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={onCancel} className="btn-ghost px-4 py-2">
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={doCrop}
                            disabled={busy}
                            aria-busy={busy}
                            className={`btn-primary px-4 py-2 ${busy ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {busy ? 'Processing…' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    if (!mounted) return null;
    return createPortal(overlay, document.body);
}

async function cropToWebp(
    imageSrc: string,
    area: Area,
    outputSize: number,
    quality: number,
    filename: string
): Promise<File> {
    const img = await loadImage(imageSrc);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    canvas.width = outputSize;
    canvas.height = outputSize;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Clip to a circle so exported image matches circular avatar appearance
    ctx.save();
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
        img,
        area.x,
        area.y,
        area.width,
        area.height,
        0,
        0,
        outputSize,
        outputSize
    );
    ctx.restore();

    const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))),
            'image/webp',
            quality
        );
    });

    return new File([blob], filename, { type: 'image/webp' });
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = src;
    });
}


