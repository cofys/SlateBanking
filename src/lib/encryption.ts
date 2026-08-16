import * as crypto from 'crypto';

function getEncryptionKey(): Buffer {
    let secret = process.env.DB_ENCRYPTION_KEY || process.env.JWT_SECRET || "slate-saas-vault-secure-encryption-key-32b";
    if (secret.length < 32) {
        secret = secret.padEnd(32, '0');
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
        return text;
    }
}

export function decryptSecret(text: string | null): string | null {
    if (!text) return text;
    if (!text.startsWith('enc:')) return text; // Fallback for unencrypted data during migration
    
    try {
        const parts = text.split(':');
        if (parts.length !== 4) return text;
        
        const [, ivHex, authTagHex, encryptedHex] = parts;
        const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error("Decryption failed", e);
        return text;
    }
}
