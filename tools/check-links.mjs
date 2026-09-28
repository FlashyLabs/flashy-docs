#!/usr/bin/env node
// Link check for every Markdown file in this repository.
//
// Scans `[text](target)` and `![alt](target)` links whose target is a
// relative path (optionally with `#anchor` or `?query`) and fails when the
// target file or directory does not exist. External links — http(s), mailto
// and any other scheme — are skipped, never fetched: this check answers
// "does the file this page points at exist in this tree", nothing more.
//
// Fenced code blocks and inline code spans are ignored, because a link
// written inside backticks is an example of a link, not a link.
//
// Dependency-free. Node 22, ESM. Exit 0 when every target resolves, 1 with a
// list of `file:line: target` otherwise.

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_DIRS = new Set(['node_modules', '.git'])

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

/** Blank out fenced blocks and inline code, keeping line numbers intact. */
export function stripCode(text) {
  const lines = text.split('\n')
  let fence = null
  const kept = lines.map((line) => {
    const open = /^\s*(```+|~~~+)/.exec(line)
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null
      return ''
    }
    if (open) {
      fence = open[1]
      return ''
    }
    // Inline code: `...` — replace the span with spaces so nothing inside is read.
    return line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
  })
  return kept.join('\n')
}

const LINK = /!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

export function isExternal(target) {
  return SCHEME.test(target) || target.startsWith('//')
}

/** The relative targets in one file, with their line numbers. */
export function relativeLinks(text) {
  const found = []
  stripCode(text).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(LINK)) {
      let target = m[1]
      if (target.startsWith('<')) target = target.slice(1, -1)
      if (target === '' || isExternal(target)) continue
      found.push({ line: i + 1, target })
    }
  })
  return found
}

export function checkFile(file) {
  const problems = []
  for (const { line, target } of relativeLinks(readFileSync(file, 'utf8'))) {
    const path = target.split('#')[0].split('?')[0]
    if (path === '') continue // an in-page anchor names no file
    let decoded = path
    try { decoded = decodeURIComponent(path) } catch { /* keep the raw path */ }
    const resolved = resolve(dirname(file), decoded)
    if (!existsSync(resolved)) problems.push({ line, target, resolved })
  }
  return problems
}

export function checkTree(root = ROOT) {
  const files = markdownFiles(root)
  const problems = []
  let links = 0
  for (const file of files) {
    links += relativeLinks(readFileSync(file, 'utf8')).length
    for (const p of checkFile(file)) problems.push({ file, ...p })
  }
  return { files: files.length, links, problems }
}

function main() {
  const { files, links, problems } = checkTree()
  for (const p of problems) {
    console.error(`${relative(ROOT, p.file)}:${p.line}: ${p.target} -> ${relative(ROOT, p.resolved)} (missing)`)
  }
  if (problems.length > 0) {
    console.error(`\ncheck-links: ${problems.length} broken relative link(s) across ${files} Markdown file(s).`)
    process.exit(1)
  }
  console.log(`check-links: ${links} relative link(s) in ${files} Markdown file(s), all resolve.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
