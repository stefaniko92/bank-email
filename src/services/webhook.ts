/**
 * Represents the data to be sent in the webhook.
 */
export interface WebhookData {
  /**
   * The transaction ID.
   */
  transactionId: string;
  /**
   * The transaction amount.
   */
  amount: number;
  /**
   * The transaction date.
   */
  date: string;
}

/**
 * Asynchronously sends a webhook POST request to the specified URL.
 *
 * @param url The URL to send the webhook to.
 * @param data The data to send in the webhook.
 * @returns A promise that resolves when the webhook is successfully sent.
 */
export async function sendWebhook(url: string, data: WebhookData): Promise<void> {
  // TODO: Implement this by calling an API.
  console.log(`Sending webhook to ${url} with data: ${JSON.stringify(data)}`);

  return;
}
