import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class PdfUnlockPassword implements ICredentialType {
  name = 'pdfUnlockPassword';
  displayName = 'PDF Unlock Password';
  documentationUrl = '';
  properties: INodeProperties[] = [
    {
      displayName: 'PDF Password',
      name: 'password',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'Password used to open or unlock the PDF file',
    },
  ];
}
