#!/usr/bin/env node
// Syntax check for the JavaScript samples in this repository's Markdown.
//
// Every fenced block tagged ```js, ```mjs or ```javascript is written to a
// temporary .mjs file and run through `node --check`. That parses the sample
// as an ES module — imports and top-level await are legal — and executes
// nothing, so a sample that names a package this checkout does not have still
// passes if it is well-formed JavaScript. It catches the failure a reader
// hits first: a snippet that does not parse.
//
// TypeScript fences (```ts, ```typescript, ```tsx) are skipped and counted,
// because nothing dependency-free can check them. Every other language is
// ignored.
//
// Dependency-free. Node 22, ESM. Exit 0 when every sample parses, 1 with a
// list of `file:line` otherwise.

import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_DIRS = new Set(['node_modules', '.git'])
const JS = new Set(['js', 'mjs', 'javascript'])
const TS = new Set(['ts', 'typescript', 'tsx'])

export function markdownFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...markdownFiles(full))
    else if (entry.name.endsWith('.md')) out.push(full)
  }
  return out.sort()
}

/** Every fenced block: { lang, line (of the first body line), body }. */
export function fences(text) {
  const lines = text.split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const open = /^\s*(```+|~~~+)\s*([^\s`]*)/.exec(lines[i])
    if (!open) { i++; continue }
    const marker = open[1]
    const lang = open[2].toLowerCase()
    let j = i + 1
    while (j < lines.length) {
      const close = /^\s*(```+|~~~+)\s*$/.exec(lines[j])
      if (close && close[1][0] === marker[0] && close[1].length >= marker.length) break
      j++
    }
    out.push({ lang, line: i + 2, body: lines.slice(i + 1, j).join('\n') })
    i = j + 1
  }
  return out
}

export function checkTree(root = ROOT) {
  const dir = mkdtempSync(join(tmpdir(), 'flashy-docs-samples-'))
  const result = { files: 0, checked: 0, skippedTypeScript: 0, failures: [] }
  try {
    let n = 0
    for (const file of markdownFiles(root)) {
      result.files++
      for (const f of fences(readFileSync(file, 'utf8'))) {
        if (TS.has(f.lang)) { result.skippedTypeScript++; continue }
        if (!JS.has(f.lang)) continue
        const tmp = join(dir, `sample-${n++}.mjs`)
        writeFileSync(tmp, f.body + '\n')
        const run = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' })
        result.checked++
        if (run.status !== 0) {
          const message = (run.stderr || run.stdout || '').split('\n')
            .filter((l) => l && !l.startsWith('    at ') && !l.startsWith(dir))
            .slice(0, 4).join('\n    ')
          result.failures.push({ file, line: f.line, lang: f.lang, message })
        }
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return result
}

function main() {
  const r = checkTree()
  for (const f of r.failures) {
    console.error(`${relative(ROOT, f.file)}:${f.line}: \`\`\`${f.lang} block does not parse\n    ${f.message}`)
  }
  const summary = `${r.checked} JavaScript sample(s) checked in ${r.files} Markdown file(s); ${r.skippedTypeScript} TypeScript fence(s) skipped (not checked).`
  if (r.failures.length > 0) {
    console.error(`\ncheck-samples: ${r.failures.length} failing. ${summary}`)
    process.exit(1)
  }
  console.log(`check-samples: all pass. ${summary}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
