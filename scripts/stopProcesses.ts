// Stops every dev process this repo started: `npm run dev`, its `tsx` game
// server and its `vite`. Several `npm run dev` sessions can pile up (each new
// vite grabs the next free port, so the tab you have open may be served by an
// old one); this kills all of them at once.
//
// Matching is deliberately narrow: a process is only a target when its command
// line names THIS checkout, or is the exact wrapper `npm run dev` spawns. A
// vite running for another project is never touched.

import { execFileSync } from 'node:child_process';

export interface Victim {
  pid: number;
  /** What to call it in the log line. */
  label: string;
  command: string;
}

export interface SelectOptions {
  repoRoot: string;
  /** This script and its parents — killing them would kill the stop itself. */
  selfPids: number[];
}

/** The wrapper `npm run dev` runs; distinctive enough to match on its own. */
const DEV_WRAPPER = "trap 'kill 0' INT TERM EXIT;";

/**
 * Picks the processes to stop out of `ps axo pid=,command=` output.
 * Pure, so the matching can be tested without spawning anything.
 */
export function selectVictims(psOutput: string, options: SelectOptions): Victim[] {
  const { repoRoot, selfPids } = options;

  return psOutput
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      const match = /^(\d+)\s+(.*)$/.exec(line);
      if (!match) return [];

      const pid = Number(match[1]);
      const command = match[2];
      if (selfPids.includes(pid)) return [];
      if (command.includes('stopProcesses') || command.includes('npm run stop')) return [];

      const isDevWrapper = command.includes(DEV_WRAPPER) && command.includes('src/server/server.ts');
      const isOurs = command.includes(repoRoot);

      if (isDevWrapper) return [{ pid, label: 'npm run dev', command }];
      if (!isOurs) return [];
      if (command.includes('src/server/server.ts')) return [{ pid, label: 'server', command }];
      if (/\bvite\b/.test(command)) return [{ pid, label: 'vite', command }];
      return [];
    });
}

function listProcesses(): string {
  try {
    return execFileSync('ps', ['axo', 'pid=,command='], { encoding: 'utf8' });
  } catch {
    return '';
  }
}

/** PIDs of this process and its ancestors, so the stop never kills itself. */
function selfChain(): number[] {
  const chain = [process.pid];
  let pid = process.ppid;

  for (let hops = 0; pid > 1 && hops < 8; hops++) {
    chain.push(pid);
    try {
      const parent = execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' });
      pid = Number(parent.trim());
      if (!Number.isFinite(pid)) break;
    } catch {
      break;
    }
  }

  return chain;
}

function signal(pid: number, sig: NodeJS.Signals | 0): boolean {
  try {
    process.kill(pid, sig);
    return true;
  } catch {
    return false; // already gone
  }
}

/** Signal 0 checks a process exists without touching it. */
const alive = (pid: number): boolean => signal(pid, 0);

/** Ports the dev setup uses: the game server, plus vite and its fallbacks. */
function busyPorts(): { port: number; command: string }[] {
  const ports = [Number(process.env.PORT) || 8080, 5173, 5174, 5175, 5176, 5177];

  return ports.flatMap(port => {
    try {
      const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
      const line = out.split('\n')[1];
      return line ? [{ port, command: line.trim() }] : [];
    } catch {
      return []; // lsof exits non-zero when nothing listens
    }
  });
}

export async function run(): Promise<void> {
  const victims = selectVictims(listProcesses(), {
    repoRoot: process.cwd(),
    selfPids: selfChain(),
  });

  if (victims.length === 0) {
    console.log('Nothing running.');
    return;
  }

  for (const victim of victims) {
    signal(victim.pid, 'SIGTERM');
    console.log(`Stopped ${victim.label} (pid ${victim.pid})`);
  }

  // Anything still up after the grace period gets SIGKILL: a wedged vite would
  // otherwise keep its port and the next `npm run dev` would silently move to
  // another one.
  await new Promise(resolve => setTimeout(resolve, 600));
  for (const victim of victims.filter(v => alive(v.pid))) {
    signal(victim.pid, 'SIGKILL');
    console.log(`Killed ${victim.label} (pid ${victim.pid})`);
  }

  // Report, never kill: a leftover here belongs to something we did not start.
  for (const { port, command } of busyPorts()) {
    console.log(`Port ${port} is still held by another process: ${command}`);
  }
}
