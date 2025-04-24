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

export default function Home() {
  const [pdfContent, setPdfContent] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<any | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      setPdfContent(content);

      // Extract payment details using AI
      const details = await extractTransactionDetails({pdfContent: content});
      setPaymentDetails(details);
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
              <p>Transaction ID: {paymentDetails.transactionId}</p>
              <p>Amount: {paymentDetails.amount}</p>
              <p>Date: {paymentDetails.date}</p>
              <p>Vendor: {paymentDetails.vendor}</p>
            </div>
          )}
        </section>
      </main>
    </SidebarProvider>
  );
}
