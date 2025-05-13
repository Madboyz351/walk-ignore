# walk-ignore

Read files from a directory recursively and ignore patterns specified in `.gitignore`.

## Install

```bash
npm i walk-ignore
```

## Usage

```ts
import { walkIgnore } from "walk-ignore"

const filenames = await walkIgnore("path/to/some/dir")
//=> ['foo', 'bar']
```

## License

MIT
