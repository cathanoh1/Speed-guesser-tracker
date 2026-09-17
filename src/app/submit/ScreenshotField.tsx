'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The screenshot <input type="file"> still does all the real work - a
 * Server Action reads it from FormData exactly as before. This just adds a
 * `paste` listener that, when the clipboard holds an image, builds a
 * FileList via the DOM's DataTransfer API and assigns it to that same input
 * (the standard, browser-blessed way to set `input.files` programmatically).
 * So pasting is purely an alternate way to fill the same field - clicking
 * "Choose File" still works exactly as it always did.
 */
export function ScreenshotField() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function applyFile(file: File) {
    const input = inputRef.current;
    if (input) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
    }
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
    setFileName(file.name || 'Pasted screenshot');
  }

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            applyFile(file);
          }
          return;
        }
      }
    }
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Revoke the last preview URL on unmount so it doesn't leak.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) applyFile(file);
  }

  function clearFile() {
    if (inputRef.current) inputRef.current.value = '';
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setFileName(null);
  }

  return (
    <div className="field">
      <label htmlFor="screenshot">Screenshot (proof)</label>

      {previewUrl ? (
        <div className="screenshot-preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not a servable asset */}
          <img src={previewUrl} alt="Screenshot preview" />
          <div className="screenshot-preview-meta">
            <span className="screenshot-preview-name">{fileName}</span>
            <button type="button" onClick={clearFile}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <p className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
          Paste a screenshot with Ctrl+V (Cmd+V on Mac) anywhere on this page, or choose a file below.
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        id="screenshot"
        name="screenshot"
        accept="image/*"
        required
        onChange={handleInputChange}
      />
      <span className="hint">Required, up to 4.5 MB. Everyone on the leaderboard can view it.</span>
    </div>
  );
}
