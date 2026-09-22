import { describe, it, expect } from 'vitest';
import { selectVictims } from '../stopProcesses';

const ROOT = '/Users/duir/dev/asterisk/endea/endead';

// `ps axo pid=,command=` output, trimmed to the shapes this repo produces.
const PS = [
  `  5720 sh -c trap 'kill 0' INT TERM EXIT; tsx --env-file-if-exists=.env src/server/server.ts & vite`,
  `  5721 node ${ROOT}/node_modules/.bin/tsx --env-file-if-exists=.env src/server/server.ts`,
  `  5722 node ${ROOT}/node_modules/.bin/vite`,
  `  5723 node ${ROOT}/node_modules/.bin/tsx src/server/server.ts`,
  `  9001 node /Users/duir/dev/other-project/node_modules/.bin/vite`,
  `  9002 npm run stop`,
  `  9003 node ${ROOT}/scripts/stopProcesses.ts`,
  `  9004 /Applications/Safari.app/Contents/MacOS/Safari`,
].join('\n');

const victims = (selfPids: number[] = []) =>
  selectVictims(PS, { repoRoot: ROOT, selfPids }).map(v => v.pid);

describe('selectVictims', () => {
  it('takes the dev server, vite and the wrapper this repo starts', () => {
    expect(victims()).toEqual(expect.arrayContaining([5720, 5721, 5722, 5723]));
  });

  it('leaves another project vite alone', () => {
    expect(victims()).not.toContain(9001);
  });

  it('never kills itself or its parents', () => {
    expect(victims([9002, 9003])).not.toContain(9002);
    expect(victims([9002, 9003])).not.toContain(9003);
  });

  it('ignores processes that have nothing to do with the app', () => {
    expect(victims()).not.toContain(9004);
  });

  it('reports what each process was, for the log line', () => {
    const found = selectVictims(PS, { repoRoot: ROOT, selfPids: [] });

    expect(found.find(v => v.pid === 5722)?.label).toBe('vite');
    expect(found.find(v => v.pid === 5721)?.label).toBe('server');
    expect(found.find(v => v.pid === 5720)?.label).toBe('npm run dev');
  });

  it('survives an empty process table', () => {
    expect(selectVictims('', { repoRoot: ROOT, selfPids: [] })).toEqual([]);
  });
});
