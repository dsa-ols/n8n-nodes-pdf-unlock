# n8n-nodes-pdf-unlock

An [n8n](https://n8n.io) community node that removes password protection from PDF files — no external API, no subscription, pure JavaScript via [pdf-lib](https://pdf-lib.js.org/).

## Features

- Removes **user passwords** (open/read protection) when the correct password is provided
- Strips **owner passwords** (print/edit/copy restrictions) automatically, even without a password
- Supports RC4 (40-bit, 128-bit) and AES-128 encryption
- Password can be supplied via a **stored credential**, a fixed value, or a dynamic expression
- Outputs the unlocked PDF as a binary field, preserving all other item data
- Works on **self-hosted n8n** and **n8n Cloud** (no system binaries required)

## Installation

In your n8n instance, go to **Settings → Community Nodes → Install** and enter:

```
n8n-nodes-pdf-unlock
```

Or install manually on a self-hosted instance:

```bash
npm install n8n-nodes-pdf-unlock
```

## Credentials

This node ships with a **PDF Unlock Password** credential type. Using it is recommended over the "Fixed Password" option because the password is encrypted at rest and never appears in exported workflow JSON.

To add a credential: **Credentials → New → PDF Unlock Password**, enter the password, and save.

## Node parameters

| Parameter | Description |
|---|---|
| **Input Binary Field** | Name of the binary field containing the locked PDF (default: `data`) |
| **Password Type** | How the password is supplied: `Credential`, `Fixed`, `From Expression`, or `None` |
| **Output Binary Field** | Name of the binary field for the unlocked PDF (default: `data`) |
| **Output File Name** | Override the output file name. Leave empty to auto-append `_unlocked` to the original name |
| **Throw on Error** | Whether to fail the item on a wrong password (default: on). Disable to pass the item through unchanged instead |

## JSON output

The node adds a `pdfUnlock` key to the item's JSON output:

```json
{
  "pdfUnlock": {
    "success": true,
    "originalFileName": "invoice.pdf",
    "outputFileName": "invoice_unlocked.pdf",
    "originalSizeBytes": 48210,
    "unlockedSizeBytes": 47890
  }
}
```

## Limitations

- Cannot crack an unknown password — you must supply the correct one
- AES-256 support depends on the pdf-lib version bundled with this package
- For unsupported encryption types, consider using `qpdf` via the Execute Command node on self-hosted instances

## Compatibility

- n8n >= 0.198.0
- Node.js >= 18

## License

[MIT](LICENSE)
