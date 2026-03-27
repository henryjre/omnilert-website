export interface ParsedAccessTokenClaims {
  permissions?: string[];
  branchIds?: string[];
  companySlug?: string;
}

function decodeBase64Url(input: string): string | null {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;

  if (typeof atob === 'function') {
    try {
      return atob(padded);
    } catch {
      return null;
    }
  }

  const bufferCtor = (globalThis as { Buffer?: { from: (data: string, encoding: string) => { toString: (encoding: string) => string } } }).Buffer;
  if (bufferCtor) {
    try {
      return bufferCtor.from(padded, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }

  return null;
}

export function parseAccessTokenClaims(accessToken: string): ParsedAccessTokenClaims {
  const payloadSegment = accessToken.split('.')[1];
  if (!payloadSegment) return {};

  const payloadJson = decodeBase64Url(payloadSegment);
  if (!payloadJson) return {};

  try {
    const parsed = JSON.parse(payloadJson) as {
      permissions?: unknown;
      branchIds?: unknown;
      companySlug?: unknown;
    };

    const claims: ParsedAccessTokenClaims = {};
    if (Array.isArray(parsed.permissions)) {
      claims.permissions = parsed.permissions.filter((value): value is string => typeof value === 'string');
    }
    if (Array.isArray(parsed.branchIds)) {
      claims.branchIds = parsed.branchIds.filter((value): value is string => typeof value === 'string');
    }
    if (typeof parsed.companySlug === 'string') {
      claims.companySlug = parsed.companySlug;
    }
    return claims;
  } catch {
    return {};
  }
}
