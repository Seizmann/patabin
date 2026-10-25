import { readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

type Secrets = Record<string, string>;

export function loadSecrets(): Secrets {
  const text = readFileSync('SECRETS.md', 'utf8');
  const secrets: Secrets = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^[A-Z0-9_]+=(.*)$/);
    if (m) secrets[m[0].slice(0, -1)] = m[1].trim();
  }
  return secrets;
}

export function need(s: Secrets, key: string): string {
  const v = s[key];
  if (!v) {
    console.error(`Missing key in SECRETS.md: ${key}`);
    process.exit(1);
  }
  return v;
}

export function trackedFiles(): string[] {
  return execSync('git ls-files -z', { encoding: 'utf8' }).split('\0').filter(Boolean);
}

export function stagedFiles(): string[] {
  return execSync('git diff --cached --name-only -z', { encoding: 'utf8' }).split('\0').filter(Boolean);
}

export function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
