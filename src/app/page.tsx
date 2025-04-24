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
import {extractTransactionDetails} from '@/ai/flows/extract-transaction-details';
import {Button} from '@/components/ui/button';
import {useToast} from '@/hooks/use-toast';

export default function Home() {
  const [pdfContent, setPdfContent] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<any | null>(null);
  const {toast} = useToast();

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

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      setPdfContent(content);

      try {
        // Extract payment details using AI
        const details = await extractTransactionDetails({pdfContent: content});
        setPaymentDetails(details);
        toast({
          title: 'Success',
          description: 'Payment details extracted successfully.',
        });
      } catch (error: any) {
        console.error('Error extracting payment details:', error);
        toast({
          title: 'Error',
          description: `Failed to extract payment details: ${error.message}`,
          variant: 'destructive',
        });
      }
    };

    // Read the file as text
    reader.readAsText(file);
  };

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <h2>Webhook Notifier</h2>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton href="#" isActive>
                  <Icons.home className="mr-2 h-4 w-4" />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton href="#">
                  <Icons.settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton href="/logs">
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
          <input type="file" accept=".pdf" onChange={handleFileUpload} />

          {paymentDetails && (
            <div className="mt-4">
              <h3>Payment Details:</h3>
              <p>Naziv i sedište primaoca: {paymentDetails.nazivSedistePrimaoca || 'Unknown'}</p>
              <p>Iznos odobrenja: {paymentDetails.iznosOdobrenja || 'Unknown'}</p>
              <p>Poziv na broj odobrenja: {paymentDetails.pozivNaBrojOdobrenja || 'Unknown'}</p>
              <p>Datum knjiženja: {paymentDetails.datumKnjizenja || 'Unknown'}</p>
            </div>
          )}
        </section>
      </main>
    </SidebarProvider>
  );
}


