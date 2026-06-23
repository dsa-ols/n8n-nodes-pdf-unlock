import {
  ICredentialsDecrypted,
  IExecuteFunctions,
  INodeCredentialDescription,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
} from 'n8n-workflow';

import { PDFDocument } from 'pdf-lib';

export class PdfUnlock implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'PDF Unlock',
    name: 'pdfUnlock',
    icon: 'file:pdfUnlock.svg',
    group: ['transform'],
    version: 1,
    description: 'Remove password protection from a PDF file (pure JS, no external API needed)',
    defaults: {
      name: 'PDF Unlock',
    },
    credentials: [
      {
        name: 'pdfUnlockPassword',
        required: false,
        displayOptions: {
          show: { passwordType: ['credential'] },
        },
      } as INodeCredentialDescription,
    ],
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      // ── Input ──────────────────────────────────────────────────
      {
        displayName: 'Input Binary Field',
        name: 'inputBinaryField',
        type: 'string',
        default: 'data',
        required: true,
        description: 'Name of the binary field that contains the password-protected PDF',
      },

      // ── Password ───────────────────────────────────────────────
      {
        displayName: 'Password Type',
        name: 'passwordType',
        type: 'options',
        options: [
          {
            name: 'None (owner/permissions password only)',
            value: 'none',
            description:
              'PDF opens without a password but has editing/printing restrictions. pdf-lib will strip them automatically.',
          },
          {
            name: 'Credential',
            value: 'credential',
            description: 'Use a stored "PDF Unlock Password" credential (recommended — keeps the password out of the workflow JSON)',
          },
          {
            name: 'Fixed Password',
            value: 'fixed',
            description: 'Provide the password directly in this node (visible in workflow JSON)',
          },
          {
            name: 'From Expression',
            value: 'expression',
            description: 'Pull the password from a field in the incoming item (e.g. from a previous node)',
          },
        ],
        default: 'credential',
        description: 'How the PDF password is supplied',
      },
      {
        displayName: 'Password',
        name: 'password',
        type: 'string',
        typeOptions: { password: true },
        default: '',
        displayOptions: {
          show: { passwordType: ['fixed'] },
        },
        description: 'Password used to open the PDF',
      },
      {
        displayName: 'Password Field (expression)',
        name: 'passwordExpression',
        type: 'string',
        default: '={{ $json.password }}',
        displayOptions: {
          show: { passwordType: ['expression'] },
        },
        description: 'Expression that resolves to the PDF password',
      },

      // ── Output ─────────────────────────────────────────────────
      {
        displayName: 'Output Binary Field',
        name: 'outputBinaryField',
        type: 'string',
        default: 'data',
        required: true,
        description: 'Name of the binary field that will contain the unlocked PDF',
      },
      {
        displayName: 'Output File Name',
        name: 'outputFileName',
        type: 'string',
        default: '',
        description:
          'File name for the output PDF. Leave empty to keep the original file name (with "_unlocked" appended).',
      },

      // ── Options ────────────────────────────────────────────────
      {
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        options: [
          {
            displayName: 'Throw on Encryption Error',
            name: 'throwOnError',
            type: 'boolean',
            default: true,
            description:
              'Whether to throw an error if the PDF cannot be unlocked (e.g. wrong password). When disabled, the original binary is passed through unchanged.',
          },
        ],
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        // ── Read parameters ──────────────────────────────────────
        const inputBinaryField = this.getNodeParameter('inputBinaryField', i) as string;
        const passwordType = this.getNodeParameter('passwordType', i) as string;
        const outputBinaryField = this.getNodeParameter('outputBinaryField', i) as string;
        const outputFileName = this.getNodeParameter('outputFileName', i) as string;
        const options = this.getNodeParameter('options', i) as { throwOnError?: boolean };
        const throwOnError = options.throwOnError !== false; // default true

        // ── Resolve password ─────────────────────────────────────
        let password: string | undefined;
        if (passwordType === 'credential') {
          const creds = await this.getCredentials('pdfUnlockPassword') as ICredentialsDecrypted & { password: string };
          password = creds.password || undefined;
        } else if (passwordType === 'fixed') {
          const raw = this.getNodeParameter('password', i) as string;
          password = raw || undefined;
        } else if (passwordType === 'expression') {
          const raw = this.getNodeParameter('passwordExpression', i) as string;
          password = raw || undefined;
        }
        // passwordType === 'none' → password stays undefined

        // ── Load binary data ─────────────────────────────────────
        const binaryData = this.helpers.assertBinaryData(i, inputBinaryField);
        const pdfBuffer = await this.helpers.getBinaryDataBuffer(i, inputBinaryField);

        // ── Unlock with pdf-lib ──────────────────────────────────
        let pdfDoc: PDFDocument;
        try {
          pdfDoc = await PDFDocument.load(pdfBuffer, {
            // pdf-lib accepts the user (open) password here.
            // For owner-only restrictions, passing undefined is fine —
            // pdf-lib ignores those restrictions automatically when saving.
            password,
            // Do not throw when the PDF has an owner password and no user password.
            ignoreEncryption: passwordType === 'none',
          });
        } catch (loadError: unknown) {
          const message = loadError instanceof Error ? loadError.message : String(loadError);
          if (!throwOnError) {
            // Pass the item through unchanged
            returnData.push(items[i]);
            continue;
          }
          throw new NodeOperationError(
            this.getNode(),
            `Could not unlock PDF: ${message}. Check that the password is correct and the encryption type is supported (RC4 or AES-128/256).`,
            { itemIndex: i },
          );
        }

        // ── Save without any encryption ──────────────────────────
        const unlockedBytes = await pdfDoc.save();
        const unlockedBuffer = Buffer.from(unlockedBytes);

        // ── Determine output file name ───────────────────────────
        let finalFileName = outputFileName;
        if (!finalFileName) {
          const originalName = binaryData.fileName ?? 'document.pdf';
          const nameWithoutExt = originalName.replace(/\.pdf$/i, '');
          finalFileName = `${nameWithoutExt}_unlocked.pdf`;
        }

        // ── Build output binary ──────────────────────────────────
        const newBinary = await this.helpers.prepareBinaryData(
          unlockedBuffer,
          finalFileName,
          'application/pdf',
        );

        returnData.push({
          json: {
            ...items[i].json,
            pdfUnlock: {
              success: true,
              originalFileName: binaryData.fileName ?? null,
              outputFileName: finalFileName,
              originalSizeBytes: pdfBuffer.length,
              unlockedSizeBytes: unlockedBuffer.length,
            },
          },
          binary: {
            ...(items[i].binary ?? {}),
            [outputBinaryField]: newBinary,
          },
          pairedItem: { item: i },
        });
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              ...items[i].json,
              error: error instanceof Error ? error.message : String(error),
            },
            pairedItem: { item: i },
          });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
