'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

export default function SettingsPage() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Load webhook configuration from the server
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/v1/webhook-config');
        if (response.ok) {
          const config = await response.json();
          setWebhookUrl(config.url || '');
          setWebhookEnabled(config.enabled !== false);
        } else {
          throw new Error('Failed to load webhook configuration');
        }
      } catch (error) {
        console.error('Error loading webhook config:', error);
        toast({
          title: 'Error loading settings',
          description: 'There was a problem loading your webhook settings.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, [toast]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save configuration to the server
      const response = await fetch('/api/v1/webhook-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
          enabled: webhookEnabled,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save webhook configuration');
      }

      const updatedConfig = await response.json();
      
      toast({
        title: 'Settings saved',
        description: 'Your webhook settings have been saved successfully.',
      });
    } catch (error) {
      console.error('Error saving webhook config:', error);
      toast({
        title: 'Error saving settings',
        description: 'There was a problem saving your webhook settings.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!webhookUrl) {
      toast({
        title: 'No webhook URL',
        description: 'Please enter a webhook URL before testing.',
        variant: 'destructive',
      });
      return;
    }

    setIsTesting(true);
    try {
      toast({
        title: 'Testing webhook',
        description: 'Sending a test payload to your webhook...',
      });

      // Send test request to the server
      const response = await fetch('/api/v1/webhook-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast({
          title: 'Webhook test successful',
          description: 'Your webhook received the test payload successfully.',
        });
      } else {
        throw new Error(result.error || 'Test failed');
      }
    } catch (error) {
      console.error('Webhook test error:', error);
      toast({
        title: 'Webhook test failed',
        description: error instanceof Error ? error.message : 'The test payload could not be delivered to your webhook.',
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-10">
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">Webhook Settings</h1>
      
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Webhook Configuration</CardTitle>
          <CardDescription>
            Configure the webhook endpoint where transaction data will be sent when new emails are received.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Webhook URL</Label>
              <Input
                id="webhook-url"
                placeholder="https://your-webhook-endpoint.com/receive"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch 
                id="webhook-enabled" 
                checked={webhookEnabled}
                onCheckedChange={setWebhookEnabled}
              />
              <Label htmlFor="webhook-enabled">Enable webhook forwarding</Label>
            </div>
            
            <div>
              <p className="text-sm text-gray-500">
                This webhook will receive transaction data extracted from PDF attachments in emails.
                Make sure your endpoint can handle POST requests with JSON data.
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={handleTest} disabled={isTesting}>
            {isTesting ? 'Testing...' : 'Test Webhook'}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardFooter>
      </Card>
      
      <Card className="max-w-2xl mt-6">
        <CardHeader>
          <CardTitle>Sample Webhook Payload</CardTitle>
          <CardDescription>
            Your webhook will receive data in this format:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-gray-100 p-4 rounded-md overflow-auto text-sm">
{`{
  "transactions": [
    {
      "nazivSedistePrimaoca": "Recipient Name",
      "iznosOdobrenja": "2.400,00",
      "pozivNaBrojOdobrenja": "05-171-209-2025-04",
      "referentnaOznaka": "348(2)",
      "datumKnjizenja": "2025-04-23"
    }
  ],
  "email": {
    "subject": "Bank Statement",
    "from": "sender@example.com",
    "timestamp": "2023-05-15T12:34:56.789Z"
  }
}`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
} 