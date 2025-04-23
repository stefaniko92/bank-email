/**
 * @fileOverview Service for logging received email data.
 */

let emailLogs: any[] = [];

/**
 * Logs the received email data.
 *
 * @param data The email data to log.
 */
export async function logEmail(data: any): Promise<void> {
  emailLogs.push({
    timestamp: new Date(),
    data,
  });
  console.log('Email logged:', data);
}

/**
 * Retrieves all logged emails.
 *
 * @returns An array of logged email data.
 */
export async function getLoggedEmails(): Promise<any[]> {
  return Promise.resolve(emailLogs);
}

/**
 * Clears all logged emails.
 */
export async function clearLoggedEmails(): Promise<void> {
  emailLogs = [];
}
