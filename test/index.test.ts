import { test, expect } from "bun:test"
import { walkIgnore } from "../src"

test("case-01", async () => {
  const files = await walkIgnore("test/case-01", "_gitignore")
  expect(files).toEqual(["bar", "nested/baz"])
})
