'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import {Icons} from '@/components/icons';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {useToast} from '@/hooks/use-toast';
import PdfUploader from '@/components/PdfUploader';
import Link from 'next/link';

export default function Home() {
  const [paymentDetails, setPaymentDetails] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const {toast} = useToast();

  const handlePdfLoad = async (file: File) => {
    try {
      setIsLoading(true);

      // Create FormData and append the file
      const formData = new FormData();
      formData.append('file', file);

      // Send the file directly to the API
      const response = await fetch('/api/v1/ai/extract-transaction-details', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to extract transaction details');
      }

      const data = await response.json();
      setPaymentDetails(data.transactions);
      toast({
        title: 'Success',
        description: 'Transaction details extracted successfully',
      });
    } catch (error: any) {
      console.error('Error processing PDF:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to process PDF',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen">
        <Sidebar>
          <SidebarHeader>
            <h2 className="text-lg font-semibold">Bank Email</h2>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <Link href="/" className="flex items-center">
                    <Icons.home className="w-4 h-4 mr-2" />
                    Home
                  </Link>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <Link href="/settings" className="flex items-center">
                    <Icons.settings className="w-4 h-4 mr-2" />
                    Settings
                  </Link>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <Link href="/logs" className="flex items-center">
                    <Icons.list className="w-4 h-4 mr-2" />
                    Logs
                  </Link>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenuButton>
              <Icons.help className="w-4 h-4 mr-2" />
              Help
            </SidebarMenuButton>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto space-y-8">
            <div>
              <h1 className="text-2xl font-bold mb-4">PDF Transaction Extractor</h1>
              <p className="text-gray-600 mb-8">
                Upload a PDF bank statement to extract transaction details.
              </p>
            </div>

            <PdfUploader onPdfLoad={handlePdfLoad} isLoading={isLoading} />

            {paymentDetails && (
              <div className="mt-8">
                <h2 className="text-xl font-semibold mb-4">Extracted Transactions</h2>
                <div className="bg-white shadow rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Recipient
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Reference
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paymentDetails.map((transaction: any, index: number) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {transaction.nazivSedistePrimaoca}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {transaction.iznosOdobrenja}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {transaction.pozivNaBrojOdobrenja}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {transaction.datumKnjizenja}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
