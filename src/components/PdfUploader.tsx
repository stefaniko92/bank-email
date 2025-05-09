'use client';

import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

interface PdfUploaderProps {
  onPdfLoad: (file: File) => Promise<void>;
  isLoading: boolean;
}

export default function PdfUploader({ onPdfLoad, isLoading }: PdfUploaderProps) {
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Please select a PDF file');
      return;
    }

    await onPdfLoad(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center w-full">
        <label
          htmlFor="pdf-upload"
          className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
        >
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <Icons.file className="w-8 h-8 mb-4 text-gray-500" />
            <p className="mb-2 text-sm text-gray-500">
              <span className="font-semibold">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-gray-500">PDF files only</p>
          </div>
          <input
            id="pdf-upload"
            type="file"
            className="hidden"
            accept=".pdf"
            onChange={handleFileChange}
            disabled={isLoading}
          />
        </label>
      </div>
      {isLoading && (
        <div className="flex items-center justify-center">
          <Icons.spinner className="w-6 h-6 animate-spin" />
          <span className="ml-2">Processing PDF...</span>
        </div>
      )}
    </div>
  );
} 