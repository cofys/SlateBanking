import * as crypto from 'crypto';

function getEncryptionKey(): Buffer {
    const secret = process.env.DB_ENCRYPTION_KEY || process.env.JWT_SECRET;
    if (!secret || secret.length < 32 || secret === "slate-saas-vault-secure-encryption-key-32b" || secret === "super_secret_jwt_key_here") {
        throw new Error("DB_ENCRYPTION_KEY (or JWT_SECRET ≥ 32 chars) must be set. Refusing hardcoded encryption fallback.");
    }
    return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(text: string | null): string | null {
    if (!text) return text;
    try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (e) {
        console.error("Encryption failed", e);
        throw e;
    }
}

export function decryptSecret(text: string | null): string | null {
    if (!text) return text;
    if (!text.startsWith('enc:')) return text; // plaintext leftovers during migration

    try {
        const parts = text.split(':');
        if (parts.length !== 4) return null;

        const [, ivHex, authTagHex, encryptedHex] = parts;
        const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error("Decryption failed", e);
        return null;
    }
}
