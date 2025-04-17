/**
 * Represents an email with attachments.
 */
export interface Email {
  /**
   * The sender's email address.
   */
  from: string;
  /**
   * The recipient's email address.
   */
  to: string;
  /**
   * The subject of the email.
   */
  subject: string;
  /**
   * The body of the email.
   */
  body: string;
  /**
   * Attachments in the email.
   */
  attachments: Attachment[];
}

/**
 * Represents an email attachment.
 */
export interface Attachment {
  /**
   * The name of the attachment.
   */
  name: string;
  /**
   * The content type of the attachment (e.g., 'application/pdf').
   */
  contentType: string;
  /**
   * The content of the attachment as a Buffer.
   */
  content: Buffer;
}


/**
 * Asynchronously receives an email.
 *
 * @returns A promise that resolves to an Email object.
 */
export async function receiveEmail(): Promise<Email> {
  // TODO: Implement this by calling an API.

  return {
    from: 'test@example.com',
    to: 'me@example.com',
    subject: 'Test Email',
    body: 'This is a test email with an attachment.',
    attachments: [
      {
        name: 'test.pdf',
        contentType: 'application/pdf',
        content: Buffer.from('Fake PDF Content'),
      },
    ],
  };
}
