// Blocks server-side request forgery via user-supplied URLs (cvUrl,
// transcriptUrl, broker attachment links). Two layers:
//  1. assertPublicHttpUrl — resolves the hostname up front and rejects
//     anything pointing at a private/loopback/link-local address (blocks
//     direct hits on cloud metadata endpoints, localhost, RFC-1918 ranges).
//  2. safeAxios — an axios instance whose beforeRedirect hook re-checks
//     every redirect hop's literal host, so a validated public URL can't
//     redirect the request into the private network.
// Known gap: the redirect check only catches a literal private IP as the
// redirect target, not DNS-rebinding to a hostname that resolves privately.
// Accepted as a lower-priority follow-up.

import axios from 'axios';
import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set(['localhost']);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 0) return true; // 0.0.0.0/8
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local fc00::/7
  if (lower.startsWith('::ffff:')) return isPrivateIPv4(lower.slice(7));
  return false;
}

function isPrivateIP(ip: string): boolean {
  return net.isIP(ip) === 6 ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

export class UnsafeUrlError extends Error {}

export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UnsafeUrlError(`Unsupported URL scheme: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeUrlError(`Blocked host: ${hostname}`);
  }

  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new UnsafeUrlError(`Blocked private IP: ${hostname}`);
    }
    return;
  }

  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0) {
    throw new UnsafeUrlError(`Could not resolve host: ${hostname}`);
  }
  for (const { address } of records) {
    if (isPrivateIP(address)) {
      throw new UnsafeUrlError(`Host ${hostname} resolves to a private address`);
    }
  }
}

// Strict hostname match — use this (not a substring/regex test on the full
// URL) before attaching any Authorization header, so a URL like
// "https://evil.com/?x=uploads.linear.app/" can't smuggle out the key.
export function isExactHost(url: string, hostname: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === hostname.toLowerCase();
  } catch {
    return false;
  }
}

function guardRedirect(options: { hostname?: string; protocol?: string }): void {
  const protocol = options.protocol ?? 'https:';
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new UnsafeUrlError(`Unsupported redirect scheme: ${protocol}`);
  }
  const hostname = (options.hostname ?? '').toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeUrlError(`Blocked redirect host: ${hostname}`);
  }
  if (net.isIP(hostname) && isPrivateIP(hostname)) {
    throw new UnsafeUrlError(`Blocked redirect to private IP: ${hostname}`);
  }
}

export const safeAxios = axios.create({
  maxRedirects: 5,
  beforeRedirect: guardRedirect,
});
