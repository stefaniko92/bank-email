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
import {useState, useEffect} from 'react';
import {extractAllTransactionDetails} from '@/ai/flows/extract-transaction-details';
import {Button} from '@/components/ui/button';
import {useToast} from '@/hooks/use-toast';
import {extractTextFromPdf} from '@/lib/pdf-utils';
import PdfLoader from '@/components/PdfLoader';

export default function Home() {
  const [pdfContent, setPdfContent] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const {toast} = useToast();

  // Check Google API key on load
  useEffect(() => {
    const checkApiKey = async () => {
      try {
        const response = await fetch('/api/v1/google-credentials');
        const data = await response.json();
        
        if (response.status !== 200) {
          setApiError(data.error || 'Failed to get Google API credentials');
          toast({
            title: 'API Configuration Error',
            description: data.error || 'Failed to get Google API credentials',
            variant: 'destructive',
          });
        }
      } catch (error: any) {
        setApiError('Could not verify Google API credentials');
        toast({
          title: 'API Configuration Error',
          description: 'Could not verify Google API credentials',
          variant: 'destructive',
        });
      }
    };
    
    checkApiKey();
  }, [toast]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      toast({
        title: 'Error',
        description: 'No file selected.',
        variant: 'destructive',
      });
      return;
    }

    if (file.type !== 'application/pdf') {
      toast({
        title: 'Error',
        description: 'Please select a PDF file.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Read the file as an ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Extract text from PDF
      const extractedText = await extractTextFromPdf(arrayBuffer);
      
      // Set the extracted text
      setPdfContent(extractedText);
      
      console.log("Extracted text:", extractedText);
      
      // Extract payment details using AI - now get all transactions
      const result = await extractAllTransactionDetails({pdfContent: extractedText});
      setPaymentDetails(result.transactions);
      
      toast({
        title: 'Success',
        description: `${result.transactions.length} payment details extracted successfully.`,
      });
    } catch (error: any) {
      console.error('Error processing PDF:', error);
      toast({
        title: 'Error',
        description: `Failed to process PDF: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PdfLoader>
      <SidebarProvider>
        <Sidebar variant="inset" collapsible="icon">
          <SidebarHeader>
            <h2>Webhook Notifier</h2>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => {}} isActive>
                    <Icons.home className="mr-2 h-4 w-4" />
                    <span>Home</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => window.location.href = '/settings'}>
                    <Icons.settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => window.location.href = '/logs'}>
                    <Icons.workflow className="mr-2 h-4 w-4" />
                    <span>Logs</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter></SidebarFooter>
        </Sidebar>
        <main className="flex-1 p-4">
          <h1>Welcome to Webhook Notifier</h1>
          <p>Receive forwarded emails, analyze attachments, and trigger webhooks.</p>

          {/* PDF Upload and Analysis Section */}
          <section className="mt-8">
            <h2>Analyze Payment PDF</h2>
            
            {apiError && (
              <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                <strong>Configuration Error:</strong> {apiError}
                <p>Please set the GOOGLE_API_KEY environment variable to use Gemini AI.</p>
              </div>
            )}
            
            <input 
              type="file" 
              accept=".pdf" 
              onChange={handleFileUpload} 
              disabled={isLoading || !!apiError} 
            />
            
            {isLoading && <p>Processing PDF, please wait...</p>}

            {paymentDetails && Array.isArray(paymentDetails) && paymentDetails.length > 0 && (
              <div className="mt-4">
                <h3>Payment Details:</h3>
                {paymentDetails.map((payment, index) => (
                  <div key={index} className="mb-6 p-4 border rounded">
                    <h4 className="font-bold">Transaction {index + 1}</h4>
                    <p>Naziv i sedište primaoca: {payment.nazivSedistePrimaoca || 'Unknown'}</p>
                    <p>Iznos odobrenja: {payment.iznosOdobrenja || 'Unknown'}</p>
                    <p>Poziv na broj odobrenja: {payment.pozivNaBrojOdobrenja || 'Unknown'}</p>
                    <p>Referentna oznaka: {payment.referentnaOznaka || 'Unknown'}</p>
                    <p>Datum knjiženja: {payment.datumKnjizenja || 'Unknown'}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </SidebarProvider>
    </PdfLoader>
  );
}
