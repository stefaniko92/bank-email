# Bank Email Processor

This Next.js application receives and processes bank statements from email attachments and extracts structured transaction data using Google's Gemini AI models. It then forwards the extracted data to a configured webhook endpoint (your source application).

## Key Features

- Receives emails via webhook (e.g., from Mailgun).
- Extracts PDF attachments from emails.
- Direct PDF processing using Gemini AI's native PDF understanding capabilities.
- Extracts key parameters for each payment (configurable in the AI flow).
- Forwards extracted transaction data to a configurable webhook URL.
- Provides a simple UI for testing PDF uploads and viewing logs/settings.

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- Google API Key for Gemini models (e.g., `gemini-1.5-pro-latest`)
- An email service capable of forwarding emails via webhook (e.g., Mailgun)
- A target webhook URL (your source application endpoint) to receive the extracted data.

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Environment Setup
1. Create a `.env.local` file in the root directory.
2. Add your Google API key:
   ```
   GOOGLE_API_KEY=your_google_ai_api_key_here
   ```
   You can obtain a Google API key from the [Google AI Studio](https://aistudio.google.com/app/apikey).
3. **(Optional but recommended)** Set the target webhook URL for your source application:
   ```
   WEBHOOK_URL=https://your-source-app.com/api/receive-payment-data
   # Or use SOURCE_APP_WEBHOOK_URL (either works)
   # SOURCE_APP_WEBHOOK_URL=https://your-source-app.com/api/receive-payment-data
   ```
   *This is the URL where the extracted transaction data will be sent.* If not set here, you **must** configure it via the `/settings` page in the application UI.

### Running the Application

1. Development mode:
   ```bash
   npm run dev
   ```
   The application will typically be available at http://localhost:9002 (check console output).

2. Build for production:
   ```bash
   npm run build
   npm start
   ```

## Usage Instructions

1.  **Configure Email Forwarding:**
    *   Set up your email service (e.g., Mailgun) to forward emails sent to a specific address (e.g., `payments@yourdomain.com`) to your application's receiving endpoint: `YOUR_APP_URL/api/v1/email/receive` (replace `YOUR_APP_URL` with your actual deployed application URL).
    *   Ensure the email service sends the full email content, including attachments, typically as `multipart/form-data`.
2.  **Configure Webhook Target:**
    *   Navigate to the `/settings` page in the application UI.
    *   Enter the URL of your source application's endpoint where the extracted transaction data should be sent.
    *   Ensure the "Enable webhook forwarding" switch is turned on.
    *   Alternatively, set the `WEBHOOK_URL` or `SOURCE_APP_WEBHOOK_URL` environment variable (see Environment Setup). The UI setting takes precedence if set.
    *   Use the "Test Webhook" button to verify connectivity.
3.  **Send Test Email:**
    *   Send an email containing a bank statement PDF as an attachment to the email address you configured in step 1.
4.  **Monitor:**
    *   Check the application logs (console output or `/logs` page in the UI) to see if the email was received and processed.
    *   Verify that your source application's webhook endpoint received the transaction data.

## Application Structure

-   **/src/app/api/v1/email/receive/route.ts**: API endpoint that receives emails from the email service (e.g., Mailgun).
-   **/src/app/api/v1/webhook-config/route.ts**: API endpoint for managing the target webhook configuration.
-   **/src/ai/flows/extract-transaction-details.ts**: Genkit flow responsible for calling the Gemini AI model to extract data directly from PDFs.
-   **/src/services/email-logger.ts**: Simple in-memory logger for received emails (for debugging/viewing in UI).
-   **/src/app/page.tsx**: Simple UI for manual PDF upload and testing extraction.
-   **/src/app/settings/page.tsx**: UI for configuring the target webhook URL.
-   **/src/app/logs/page.tsx**: UI for viewing received email logs.

## Troubleshooting

-   **Emails not received:**
    *   Verify your email service (e.g., Mailgun) forwarding/route configuration.
    *   Check Mailgun logs for delivery errors to your `/api/v1/email/receive` endpoint.
    *   Ensure your application is running and accessible at the configured URL.
-   **PDFs not processed / No transactions extracted:**
    *   Check application logs for errors during PDF processing or AI calls.
    *   Verify the `GOOGLE_API_KEY` is correct and has access to the necessary Gemini models.
    *   Ensure the PDF attachment is not corrupted and contains readable text.
    *   Adjust the prompt in `extract-transaction-details.ts` if the AI consistently fails to extract data for your specific bank statement format.
-   **Webhook not triggering:**
    *   Confirm the webhook URL is correctly entered and enabled in the `/settings` page or environment variables.
    *   Use the "Test Webhook" button on the `/settings` page.
    *   Check application logs for errors during the webhook POST request.
    *   Ensure your target webhook endpoint is running and accessible.
-   **500 Errors:**
    *   Check server-side logs for detailed error messages (API key issues, AI model errors, file system permission errors for config).
    *   Ensure environment variables (`GOOGLE_API_KEY`, optionally `WEBHOOK_URL`) are correctly set.

## Development

-   **Test PDF Extraction:** Use the manual upload feature on the home page (`/`) to test PDF processing and AI extraction without needing email setup.

    