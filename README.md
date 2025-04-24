# Bank Email Processor

This Next.js application receives and processes bank statements from email attachments and extracts structured transaction data using Google's Gemini AI models.

## Key Features

- PDF processing and text extraction
- Gemini AI integration for transaction data extraction
- Extracts 4 key parameters for each payment:
  - `nazivSedistePrimaoca` (Name and address of recipient)
  - `iznosOdobrenja` (Transaction amount)
  - `pozivNaBrojOdobrenja` (Reference number)
  - `datumKnjizenja` (Transaction date)

## Setup Instructions

### Prerequisites
- Node.js 16+ and npm
- Google API Key for Gemini models

### Installation
1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```

### Environment Setup
1. Create an `.env` file in the root directory with your Google API key:
   ```
   GOOGLE_API_KEY=your_api_key_here
   ```

2. You can obtain a Google API key from the [Google AI Studio](https://makersuite.google.com/app/apikey)

### Running the Application

1. Development mode:
   ```
   npm run dev
   ```
   The application will be available at http://localhost:9002

2. Build for production:
   ```
   npm run build
   npm start
   ```

## Usage Instructions

1. Navigate to the home page
2. Upload a bank statement PDF
3. The application will extract the text from the PDF and send it to Gemini AI
4. Gemini will analyze the text and extract the 4 key parameters
5. The extracted data will be displayed on the page

## Troubleshooting

If you encounter a 500 error when uploading PDFs:

1. Make sure your Google API key is correctly set in the `.env` file
2. Check that you are uploading a valid PDF file
3. Ensure the PDF contains Serbian bank statement data in the expected format
4. Check the console logs for more detailed error information

## Development

To test PDF extraction without the UI, use the test script:

```
node -r dotenv/config src/scripts/test-pdf.js path/to/your/pdf/file.pdf
```

This will extract the text from the PDF and save it to a file, which can be helpful for debugging.
