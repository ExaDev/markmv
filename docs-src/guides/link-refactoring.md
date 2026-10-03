---
title: Link refactoring
---

# Link refactoring

Moving a markdown file breaks every link that points at it, and every relative link inside it. markmv moves the file and rewrites the links that would otherwise break, so a move is one operation rather than a move followed by a search and replace.

## What counts as a link

markmv recognises these kinds of reference:

| Kind                    | What it is                                          |
| ----------------------- | --------------------------------------------------- |
| `internal`              | A link from one markdown file to another local file |
| `external`              | A link to a web address                             |
| `anchor`                | A link to a heading within a page                   |
| `image`                 | An embedded image                                   |
| `reference`             | A reference-style link and its definition           |
| `claude-import`         | An import path in a Claude instructions file        |
| `wikilink`              | An Obsidian `[[wikilink]]`                          |
| `obsidian-transclusion` | An Obsidian `![[embed]]`                            |

## Previewing a move

Add `--dry-run` to see what would change without writing anything, and `--json` to get the result in a form a script can read:

```bash
markmv move docs/old-guide.md guides/new-guide.md --dry-run
markmv move docs/old-guide.md guides/new-guide.md --json
```

## Moving several files at once

Pass several sources and a destination to move them together. When each file has its own destination, use pair mode: `--pairs` reads the arguments as alternating source and destination, and `--pairs-file <path>` reads one tab-separated pair per line, with `-` reading from standard input. Pair mode uses literal paths and does no glob expansion, so let your shell do any matching first.

## Obsidian vaults

Pass `--obsidian` to treat `[[wikilinks]]` as Obsidian vault links, resolved by note name rather than by path.

## Checking the result

[markmv validate](../../docs-generated/cli/validate.md) checks that links still resolve, and [markmv check-links](../../docs-generated/cli/check-links.md) reports broken ones. Every option for moving is listed in the [markmv move reference](../../docs-generated/cli/move.md).
