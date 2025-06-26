/*import google from '@googleapis/docs'
import { GoogleAuth } from 'google-auth-library'

export class DocsService {
  private docsClient: ReturnType<typeof google.docs>
  private authClient: GoogleAuth

  constructor() {
    this.authClient = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/documents.readonly']
    })

    this.docsClient = google.docs({ version: 'v1', auth: this.authClient })
  }

  async getRawText(documentId: string): Promise<string> {
    //const auth = await this.authClient.getClient()
    const res = await this.docsClient.documents.get({ documentId })
    const content = res.data.body?.content ?? []

    const rawText = content
      .map(block =>
        block.paragraph?.elements
          ?.map(e => e.textRun?.content ?? '')
          .join('') ?? ''
      )
      .join('\n')

    return rawText
  }
}*/
