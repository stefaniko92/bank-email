'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsPage() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Load current webhook configuration
    fetch('/api/v1/webhook-config')
      .then(res => res.json())
      .then(data => {
        if (data.url) setWebhookUrl(data.url);
        if (data.enabled !== undefined) setIsEnabled(data.enabled);
      })
      .catch(error => {
        console.error('Error loading webhook config:', error);
        toast({
          title: 'Error',
          description: 'Failed to load webhook configuration',
          variant: 'destructive',
        });
      });
  }, [toast]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/webhook-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
          enabled: isEnabled,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save webhook configuration');
      }

      toast({
        title: 'Success',
        description: 'Webhook configuration saved successfully',
      });
    } catch (error) {
      console.error('Error saving webhook config:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save webhook configuration',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
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

      const response = await fetch('/api/v1/webhook-config/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
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

  return (
    <div className="container mx-auto py-10">
      <Card>
        <CardHeader>
          <CardTitle>Webhook Configuration</CardTitle>
          <CardDescription>
            Configure the webhook URL where transaction data will be sent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Webhook URL</Label>
            <Input
              id="webhook-url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-webhook-endpoint.com/webhook"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="webhook-enabled"
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
            />
            <Label htmlFor="webhook-enabled">Enable webhook</Label>
          </div>

          <div className="flex space-x-4">
            <Button
              onClick={handleSave}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Settings'}
            </Button>
            
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || !webhookUrl}
            >
              {isTesting ? 'Testing...' : 'Test Webhook'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 