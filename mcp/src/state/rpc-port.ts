import fs from 'fs';
import path from 'path';
import os from 'os';

export function getRpcUrl(): string | undefined {
  if (process.env.DAIHARNESS_RPC_URL) {
    return process.env.DAIHARNESS_RPC_URL;
  }
  try {
    const portFile = path.join(os.homedir(), '.daiharness-console', 'rpc-port.txt');
    if (fs.existsSync(portFile)) {
      const port = fs.readFileSync(portFile, 'utf8').trim();
      if (port) {
        return `ws://127.0.0.1:${port}`;
      }
    }
  } catch {
    // An unreadable port file means no console is listening; report no URL.
  }
  return undefined;
}
