/**
 * AES-256-GCM credential encryption for integration provider secrets.
 *
 * The encryption key comes from the INTEGRATION_ENCRYPTION_KEY environment
 * variable (32 bytes, base64-encoded). It never touches the database.
 * A stolen DB dump cannot decrypt stored credentials.
 *
 * Ciphertext format stored in the DB:
 *   base64( iv[12 bytes] || ciphertext || authTag[16 bytes] )
 */

const KEY_ENV = "INTEGRATION_ENCRYPTION_KEY";

async function getKey(): Promise<CryptoKey> {
  const b64 = Deno.env.get(KEY_ENV);
  if (!b64) throw new Error(`Missing env var: ${KEY_ENV}`);

  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error(`${KEY_ENV} must be exactly 32 bytes`);

  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt a credentials object. Returns an opaque base64 string for DB storage. */
export async function encryptCredentials(plain: Record<string, string>): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(plain));

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  // Concatenate iv + ciphertext (which already includes the 16-byte auth tag)
  const combined = new Uint8Array(iv.byteLength + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.byteLength);

  return btoa(String.fromCharCode(...combined));
}

/** Decrypt a previously encrypted credentials string. Returns the original object. */
export async function decryptCredentials(
  cipher: string,
): Promise<Record<string, string>> {
  const key = await getKey();
  const combined = Uint8Array.from(atob(cipher), (c) => c.charCodeAt(0));

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return JSON.parse(new TextDecoder().decode(plainBuffer));
}
