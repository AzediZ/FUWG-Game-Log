// Tiny --flag value parser with --help output.
export function parseArgs(argv, spec) {
  const out = {};
  for (const [k, v] of Object.entries(spec)) if ('default' in v) out[k] = v.default;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log('Options:');
      for (const [k, v] of Object.entries(spec)) console.log(`  --${k}${v.flag ? '' : ' <value>'}  ${v.help || ''}${'default' in v ? ` (default: ${v.default})` : ''}`);
      process.exit(0);
    }
    if (!a.startsWith('--')) throw new Error(`Unexpected argument ${a}`);
    let key = a.slice(2);
    let negated = false;
    if (key.startsWith('no-') && spec[key.slice(3)]?.flag) { key = key.slice(3); negated = true; }
    const s = spec[key];
    if (!s) throw new Error(`Unknown option --${key} (see --help)`);
    if (s.flag) out[key] = !negated;
    else {
      if (i + 1 >= argv.length) throw new Error(`--${key} needs a value`);
      out[key] = argv[++i];
    }
  }
  for (const [k, v] of Object.entries(spec)) if (v.required && out[k] === undefined) throw new Error(`--${k} is required (see --help)`);
  return out;
}
