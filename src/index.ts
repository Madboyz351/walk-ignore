import path from "node:path"
import fs from "node:fs/promises"
import ignore, { type Ignore } from "ignore"

/**
 * Recursively collects files from a directory, respecting .gitignore rules.
 * @param currentDirPath Absolute path to the current directory being walked.
 * @param rootDir Absolute path to the root directory of the walk operation.
 * @param parentIg The ignore instance inherited from the parent directory.
 * @returns A promise that resolves to an array of file paths relative to rootDir.
 */
async function collectFilesRecursively(
  currentDirPath: string,
  rootDir: string,
  parentIg: Ignore,
  ignoreFileName: string
): Promise<string[]> {
  const allFoundFiles: string[] = []
  let effectiveIg = parentIg

  const gitignorePath = path.join(currentDirPath, ignoreFileName)
  try {
    // Check if .gitignore exists and is a file, then read it.
    // fs.access can check existence, readFile will fail if it's not a file or not readable.
    const gitignoreContent = await fs.readFile(gitignorePath, "utf-8")
    const rawPatterns = gitignoreContent
      .split(/\\r?\\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))

    if (rawPatterns.length > 0) {
      const pathPrefixFromRoot = path.relative(rootDir, currentDirPath)
      const pathPrefixPosix = pathPrefixFromRoot
        .split(path.sep)
        .join(path.posix.sep)

      const adjustedPatternsThisLevel: string[] = []
      for (const rawPattern of rawPatterns) {
        let p = rawPattern // Already trimmed
        const isNegated = p.startsWith("!")
        if (isNegated) {
          p = p.substring(1)
        }

        const isAnchoredBySlash = p.startsWith("/") // Original pattern started with /
        if (isAnchoredBySlash) {
          p = p.substring(1)
        }

        // p is now the core pattern string, e.g., "foo.txt", "bar/baz.txt", "*.log"

        const patternsToConsiderAdding: string[] = []

        if (isAnchoredBySlash || p.includes("/")) {
          // Pattern is specific, like /foo.txt, dir/file.txt, build/
          // It's relative to the current .gitignore's directory.
          // Prepend the current directory's relative path from root.
          const effectivePath = pathPrefixPosix
            ? path.posix.join(pathPrefixPosix, p)
            : p
          patternsToConsiderAdding.push(effectivePath)
        } else {
          // Pattern has no slashes and was not anchored by '/', e.g., "*.log" or "temp.txt"
          // It should match in the current directory and any subdirectory.
          // Match in current directory: prefix/pattern
          const directPath = pathPrefixPosix
            ? path.posix.join(pathPrefixPosix, p)
            : p
          patternsToConsiderAdding.push(directPath)

          // Match in subdirectories: prefix/**/pattern (or just **/pattern if at root)
          const deepPath = pathPrefixPosix
            ? path.posix.join(pathPrefixPosix, "**", p)
            : path.posix.join("**", p)

          // Avoid adding identical patterns if directPath and deepPath resolve to the same thing
          // (e.g. if p was empty, or p was already like '**/*')
          if (directPath !== deepPath) {
            patternsToConsiderAdding.push(deepPath)
          }
        }

        for (const finalPattern of patternsToConsiderAdding) {
          adjustedPatternsThisLevel.push(
            isNegated ? "!" + finalPattern : finalPattern
          )
        }
      }

      if (adjustedPatternsThisLevel.length > 0) {
        effectiveIg = effectiveIg.add(adjustedPatternsThisLevel)
      }
    }
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      // ENOENT means file not found, which is fine for .gitignore
      console.warn(
        `Warning: Could not read ${ignoreFileName} at ${gitignorePath}: ${err.message}`
      )
    }
  }

  const entries = await fs.readdir(currentDirPath, { withFileTypes: true })
  for (const entry of entries) {
    const entryName = entry.name
    if (entryName === ".git") {
      // Always ignore .git directory
      continue
    }

    const entryAbsolutePath = path.join(currentDirPath, entryName)
    let entryRelativePathFromRoot = path.relative(rootDir, entryAbsolutePath)
    entryRelativePathFromRoot = entryRelativePathFromRoot
      .split(path.sep)
      .join(path.posix.sep)

    // .gitignore files themselves are processed but not included in the output.
    // Their own ignore status doesn't prevent loading them.
    // The check `effectiveIg.ignores` is for other files/dirs.
    if (
      entryName !== ignoreFileName &&
      effectiveIg.ignores(entryRelativePathFromRoot)
    ) {
      continue
    }

    if (entry.isFile()) {
      if (entryName !== ignoreFileName) {
        // Do not include .gitignore files in the result
        allFoundFiles.push(entryRelativePathFromRoot)
      }
    } else if (entry.isDirectory()) {
      // If a directory is not ignored, recurse into it.
      // The ignores check above would have skipped if the directory itself was explicitly ignored.
      const subDirFiles = await collectFilesRecursively(
        entryAbsolutePath,
        rootDir,
        effectiveIg,
        ignoreFileName
      )
      allFoundFiles.push(...subDirFiles)
    }
  }
  return allFoundFiles
}

/**
 * walk a directory recursively to find all files
 * and ignore the files that are in the .gitignore file
 * .gitignore can be nested in the directory just like a regular git repo
 * @param root directory
 */
export async function walkIgnore(
  root: string,
  ignoreFileName = ".gitignore"
): Promise<string[]> {
  const absoluteRoot = path.resolve(root)
  const initialIg = ignore() // Create an empty ignore instance

  // Start the recursive collection from the absolute root
  const files = await collectFilesRecursively(
    absoluteRoot,
    absoluteRoot,
    initialIg,
    ignoreFileName
  )
  return files
}
