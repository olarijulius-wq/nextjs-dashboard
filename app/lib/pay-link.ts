import crypto from 'crypto';

type PayLinkPayload = {
  invoiceId: string;
};

function getPayLinkSecret() {
  const secret = process.env.PAY_LINK_SECRET;
  if (!secret) {
    throw new Error('Missing PAY_LINK_SECRET');
  }
  return secret;
}

function encodePayload(payload: PayLinkPayload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(encoded: string): PayLinkPayload | null {
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as PayLinkPayload;
    if (!parsed?.invoiceId || typeof parsed.invoiceId !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function signPayload(encoded: string) {
  const secret = getPayLinkSecret();
  return crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
}

export function generatePayToken(invoiceId: string) {
  const encoded = encodePayload({ invoiceId });
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

export function verifyPayToken(token: string): PayLinkPayload | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = signPayload(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  return decodePayload(encoded);
}

export function generatePayLink(baseUrl: string, invoiceId: string) {
  const token = generatePayToken(invoiceId);
  return `${baseUrl}/pay/${token}`;
}
