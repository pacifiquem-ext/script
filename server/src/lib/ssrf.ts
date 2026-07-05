import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { BadRequestError } from '../common/errors';

function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd'))
    return true;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p)))
    return net.isIP(ip) === 0 ? false : false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestError('Invalid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw new BadRequestError('Only http(s) URLs are allowed');
  if (url.username || url.password)
    throw new BadRequestError('URLs with credentials are not allowed');
  const hostname = url.hostname;
  if (hostname === 'localhost' || hostname.endsWith('.local'))
    throw new BadRequestError('Local URLs are not allowed');
  const addresses = await lookup(hostname, { all: true });
  for (const addr of addresses) {
    if (isPrivateIp(addr.address))
      throw new BadRequestError('URL resolves to a private network address');
  }
  return url;
}
