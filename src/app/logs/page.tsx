'use client';

import React, {useState, useEffect} from 'react';
import {getLoggedEmails, clearLoggedEmails} from '@/services/email-logger';
import {Button} from '@/components/ui/button';
import {Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';

interface LoggedEmail {
  id: string;
  subject: string;
  from: string;
  to: string;
  timestamp: string;
  messageId: string;
}

export default function LogsPage() {
  const [emails, setEmails] = useState<LoggedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEmails() {
      setLoading(true);
      try {
        const loggedEmails = await getLoggedEmails();
        setEmails(loggedEmails);
        setError(null);
      } catch (e: any) {
        setError(e.message || 'Failed to fetch emails');
        setEmails([]);
      } finally {
        setLoading(false);
      }
    }

    fetchEmails();
  }, []);

  async function handleClearLogs() {
    await clearLoggedEmails();
    setEmails([]); // Update state to reflect the cleared logs
  }

  return (
    <div>
      <h1>Email Logs</h1>
      <Button onClick={handleClearLogs}>Clear Logs</Button>

      {loading && <p>Loading emails...</p>}
      {error && <p>Error: {error}</p>}

      <Table>
        <TableCaption>A list of emails received.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp</TableHead>
            <TableHead>Sender</TableHead>
            <TableHead>Subject</TableHead>
            {/* Add more headers as needed */}
          </TableRow>
        </TableHeader>
        <TableBody>
          {emails.map((email, index) => (
            <TableRow key={index}>
              <TableCell>{new Date(email.timestamp).toLocaleString()}</TableCell>
              <TableCell>{email.from}</TableCell>
              <TableCell>{email.subject}</TableCell>
              {/* Add more cells as needed */}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
