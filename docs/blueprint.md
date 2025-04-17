# **App Name**: Webhook Notifier

## Core Features:

- Email Intake: Receive forwarded emails via a designated email address.
- Attachment Parsing: Parse the received email for attachments, specifically PDFs.
- PDF Content Analysis: If a PDF attachment is found, extract the text content from the PDF to determine if it contains any transaction information. Use an AI model as a tool to identify key transactional details.
- Webhook Trigger: If transactions are identified, format the relevant data and send a webhook POST request to a predefined URL.
- Event Logging: Log all email intake and webhook event for auditing purposes.

## Style Guidelines:

- Primary color: Neutral grey (#F5F5F5) for a clean, professional look.
- Secondary color: White (#FFFFFF) for content areas.
- Accent: Teal (#008080) for interactive elements and highlights.
- Clean and readable sans-serif fonts for all text elements.
- Simple, outline-style icons for key actions and status indicators.
- Clear, well-spaced layout with a focus on readability and ease of use.

## Original User Request:
Hello I want to create app that receive forwarded email, analyze pdf content if exists and trigger some webhook to inform another app about received transactions
  