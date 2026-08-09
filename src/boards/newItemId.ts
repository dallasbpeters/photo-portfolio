/**
 * A uuid for a newly placed board item.
 *
 * crypto.randomUUID exists only in a secure context, so it is present on
 * https and on localhost but *not* when the dev server is opened from another
 * device over the LAN — which is exactly how these boards get tested on a
 * phone. Without a fallback the item would carry no id, and the API refuses an
 * item whose id is not a uuid: the note would simply never save.
 *
 * getRandomValues has the same secure-context caveat, so the last resort is
 * Math.random. Uniqueness within one board is all that is required here; these
 * ids are not secrets and are not used for anything but identity.
 */
export const newItemId = (): string => {
  // Typed as optional because the narrowing below is about what the *runtime*
  // provides, which the DOM types assume is always present.
  const webCrypto: Partial<Crypto> | undefined =
    typeof crypto === "undefined" ? undefined : crypto;

  if (webCrypto?.randomUUID) {
    return webCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // Version 4, variant 1, as the API's uuid check expects. The remainder drops
  // the high bits the marker replaces, so adding it is the same as setting it.
  bytes[6] = (bytes[6] % 0x10) + 0x40;
  bytes[8] = (bytes[8] % 0x40) + 0x80;

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
