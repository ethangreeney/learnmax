'use client';

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { upload } from '@vercel/blob/client';
import { useRouter } from 'next/navigation';
import { useMeStore } from '@/lib/client/me-store';
import AvatarCropper from '@/components/AvatarCropper';

export type PublicProfile = {
  id: string;
  name: string | null;
  username: string | null;
  bio: string | null;
  image: string | null;
  elo: number;
  streak: number;
  masteredCount: number;
  quiz: { totalAttempts: number; correct: number; accuracy: number };
  isAdmin?: boolean;
  rank?: {
    slug: string;
    name: string;
    minElo: number;
    iconUrl: string | null;
  } | null;
};

type EditableProfile = {
  name: string;
  username: string;
  bio: string;
};

type ProfileResponse = {
  error?: string;
  user?: {
    name: string | null;
    username: string | null;
    bio: string | null;
    image: string | null;
  };
};

const USERNAME_RULE = /^[a-z0-9_]{3,20}$/;
const SUPPORTED_AVATAR_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const BIO_LIMIT = 240;
const AVATAR_LIMIT_BYTES = 12 * 1024 * 1024;

function formValues(user: PublicProfile): EditableProfile {
  return {
    name: user.name || '',
    username: user.username || '',
    bio: user.bio || '',
  };
}

async function responseData(response: Response): Promise<ProfileResponse> {
  return response.json().catch(() => ({}));
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'The request timed out. Check your connection and try again.';
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function ProfileClient({
  initialUser,
}: {
  initialUser: PublicProfile;
}) {
  const initialValues = useMemo(() => formValues(initialUser), [initialUser]);
  const [name, setName] = useState(initialValues.name);
  const [username, setUsername] = useState(initialValues.username);
  const [bio, setBio] = useState(initialValues.bio);
  const [persisted, setPersisted] = useState(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [pickedIsGif, setPickedIsGif] = useState(false);
  const avatarInFlight = useRef(false);
  const cropObjectUrl = useRef<string | null>(null);
  const router = useRouter();
  const setMe = useMeStore((state) => state.setMe);

  useEffect(() => {
    return () => {
      if (cropObjectUrl.current) {
        URL.revokeObjectURL(cropObjectUrl.current);
      }
    };
  }, []);

  const usernameValid = username.length === 0 || USERNAME_RULE.test(username);
  const hasChanges =
    name !== persisted.name ||
    username !== persisted.username ||
    bio !== persisted.bio;

  function markEdited() {
    setError(null);
    setSuccess(null);
  }

  function clearCropSelection(source = cropSrc) {
    if (source) URL.revokeObjectURL(source);
    if (cropObjectUrl.current === source) cropObjectUrl.current = null;
    setCropSrc(null);
    setPickedFile(null);
    setPickedIsGif(false);
  }

  async function patchProfile(
    body: Record<string, string>,
    timeoutMs = 15_000
  ) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await responseData(response);
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            'Your session expired. Refresh the page, sign in, and try again.'
          );
        }
        if (response.status === 409) {
          throw new Error('That username is already taken. Try another.');
        }
        throw new Error(data.error || 'Your changes could not be saved.');
      }
      return data.user;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChanges || saving || avatarSaving) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (username && !USERNAME_RULE.test(username)) {
        throw new Error(
          'Use 3–20 lowercase letters, numbers, or underscores for your username.'
        );
      }

      const user = await patchProfile({ name, username, bio });
      if (!user) throw new Error('Your changes could not be confirmed.');

      const confirmed = {
        name: user.name || '',
        username: user.username || '',
        bio: user.bio || '',
      };
      setName(confirmed.name);
      setUsername(confirmed.username);
      setBio(confirmed.bio);
      setPersisted(confirmed);
      setMe({
        name: user.name,
        username: user.username,
        image: user.image,
      });
      setSuccess('Profile saved.');
      router.refresh();
    } catch (saveError) {
      setError(
        errorMessage(
          saveError,
          'Your changes could not be saved. Please try again.'
        )
      );
    } finally {
      setSaving(false);
    }
  }

  function onPickAvatar(file: File) {
    setError(null);
    setSuccess(null);

    if (!SUPPORTED_AVATAR_TYPES.has(file.type)) {
      setError('Choose a PNG, JPEG, WebP, or GIF image.');
      return;
    }
    if (file.size === 0) {
      setError('That image is empty. Choose another file.');
      return;
    }
    if (file.size > AVATAR_LIMIT_BYTES) {
      setError('Choose an image smaller than 12 MB.');
      return;
    }

    try {
      if (cropObjectUrl.current) {
        URL.revokeObjectURL(cropObjectUrl.current);
      }
      const objectUrl = URL.createObjectURL(file);
      cropObjectUrl.current = objectUrl;
      setCropSrc(objectUrl);
      setPickedFile(file);
      setPickedIsGif(file.type === 'image/gif');
    } catch (pickError) {
      setError(errorMessage(pickError, 'The image could not be opened.'));
    }
  }

  async function saveAvatar(url: string) {
    const user = await patchProfile({ image: url });
    if (!user) throw new Error('Your avatar could not be confirmed.');
    const confirmedImage = user.image || url;
    setMe({ image: confirmedImage });
    setSuccess('Avatar updated.');
    router.refresh();
  }

  async function onStaticCrop(croppedFile: File) {
    if (avatarInFlight.current) return;
    avatarInFlight.current = true;
    setAvatarSaving(true);
    setError(null);
    setSuccess(null);
    const source = cropSrc;
    setCropSrc(null);

    try {
      const pathname = `avatars/${initialUser.id}-${Date.now()}.webp`;
      const { url } = await upload(pathname, croppedFile, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload-url',
        contentType: 'image/webp',
      });
      const cacheSafeUrl = `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
      await saveAvatar(cacheSafeUrl);
    } catch (uploadError) {
      setError(
        errorMessage(
          uploadError,
          'Your avatar could not be uploaded. Please try again.'
        )
      );
    } finally {
      clearCropSelection(source);
      avatarInFlight.current = false;
      setAvatarSaving(false);
    }
  }

  async function onGifCrop(area: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    if (!pickedFile || avatarInFlight.current) return;
    avatarInFlight.current = true;
    setAvatarSaving(true);
    setError(null);
    setSuccess(null);
    const source = cropSrc;
    setCropSrc(null);

    try {
      const sourcePath = `avatars/${initialUser.id}-${Date.now()}.source.gif`;
      const uploaded = await upload(sourcePath, pickedFile, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload-url',
        contentType: 'image/gif',
        multipart: pickedFile.size > 10_000_000,
      });

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 45_000);
      const response = await fetch('/api/avatar/crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: uploaded.url,
          area: {
            x: area.x,
            y: area.y,
            width: area.width,
            height: area.height,
          },
          outputSize: 512,
        }),
        signal: controller.signal,
      }).finally(() => window.clearTimeout(timeout));
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
      };
      if (!response.ok || !data.url) {
        throw new Error(data.error || 'The GIF could not be processed.');
      }

      const cacheSafeUrl = `${data.url}${data.url.includes('?') ? '&' : '?'}v=${Date.now()}`;
      await saveAvatar(cacheSafeUrl);
    } catch (cropError) {
      setError(
        errorMessage(
          cropError,
          'Your GIF could not be processed. Please try again.'
        )
      );
    } finally {
      clearCropSelection(source);
      avatarInFlight.current = false;
      setAvatarSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSave}
      className="card space-y-6 p-5 sm:p-6"
      aria-busy={saving || avatarSaving}
    >
      {cropSrc && (
        <AvatarCropper
          src={cropSrc}
          onCancel={() => {
            if (!avatarInFlight.current) clearCropSelection();
          }}
          onCropped={onStaticCrop}
          mode={pickedIsGif ? 'gif' : 'static'}
          onGifCrop={onGifCrop}
        />
      )}

      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center sm:gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Edit profile</h3>
          <p className="mt-1 text-sm text-neutral-500">
            These details appear on your public profile.
          </p>
        </div>
        <div className="min-h-5 text-xs" aria-live="polite" aria-atomic="true">
          {success ? <span className="text-emerald-400">{success}</span> : null}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid content-start gap-2 text-sm">
          <span className="font-medium text-neutral-300">Name</span>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              markEdited();
            }}
            className="input h-10"
            placeholder="Display name"
            autoComplete="name"
            maxLength={80}
            disabled={saving}
          />
        </label>

        <label className="grid content-start gap-2 text-sm">
          <span className="font-medium text-neutral-300">Username</span>
          <div
            className={`flex h-10 items-center rounded-md bg-neutral-900/80 ring-1 ${
              username && !usernameValid
                ? 'ring-red-500'
                : 'ring-neutral-700 focus-within:ring-emerald-500'
            }`}
          >
            <span
              className="pr-1 pl-3 text-neutral-500 select-none"
              aria-hidden="true"
            >
              @
            </span>
            <input
              value={username}
              onChange={(event) => {
                setUsername(event.target.value.toLowerCase());
                markEdited();
              }}
              className="w-full bg-transparent px-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="your_handle"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={20}
              disabled={saving}
              aria-invalid={Boolean(username && !usernameValid)}
              aria-describedby="username-help"
            />
          </div>
          <span
            id="username-help"
            className={`text-xs ${
              username && !usernameValid ? 'text-red-400' : 'text-neutral-500'
            }`}
          >
            Use 3–20 lowercase letters, numbers, or underscores.
          </span>
        </label>

        <label className="grid gap-2 text-sm md:col-span-2">
          <span className="font-medium text-neutral-300">Bio</span>
          <textarea
            value={bio}
            onChange={(event) => {
              setBio(event.target.value.slice(0, BIO_LIMIT));
              markEdited();
            }}
            rows={4}
            maxLength={BIO_LIMIT}
            className="input min-h-28 resize-y p-4 leading-6"
            placeholder="What are you learning?"
            disabled={saving}
            aria-describedby="bio-help bio-count"
          />
          <div className="flex items-center justify-between gap-4 text-xs text-neutral-500">
            <span id="bio-help">A short introduction for other learners.</span>
            <span id="bio-count" className="tabular-nums">
              {bio.length}/{BIO_LIMIT}
            </span>
          </div>
        </label>
      </div>

      <div className="flex flex-col justify-between gap-4 border-t border-neutral-800 pt-5 sm:flex-row sm:items-center">
        <div>
          <label
            className={`btn-ghost focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-2 focus-within:ring-offset-neutral-950 ${
              saving || avatarSaving
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-pointer'
            }`}
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              disabled={saving || avatarSaving}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onPickAvatar(file);
                event.target.value = '';
              }}
            />
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
            Change avatar
          </label>
          <p className="mt-2 text-xs text-neutral-500">
            PNG, JPEG, WebP, or GIF. Animated images can take longer.
          </p>
        </div>

        <button
          type="submit"
          disabled={
            saving ||
            avatarSaving ||
            !hasChanges ||
            Boolean(username && !usernameValid)
          }
          className="btn-primary min-w-32 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? 'Saving…'
            : avatarSaving
              ? 'Updating avatar…'
              : 'Save changes'}
        </button>
      </div>

      {error ? (
        <div
          className="rounded-md border border-red-900/50 bg-red-950/25 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {avatarSaving ? 'Updating avatar.' : ''}
      </span>
    </form>
  );
}
