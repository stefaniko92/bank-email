'use client';

import React, {useState, useEffect} from 'react';
import {getLoggedEmails, clearLoggedEmails} from '@/services/email-logger';
import {Button} from '@/components/ui/button';
import {Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';

export default function LogsPage() {
  const [emails, setEmails] = useState([]);

  useEffect(() => {
    async function fetchEmails() {
      const loggedEmails = await getLoggedEmails();
      setEmails(loggedEmails);
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
              <TableCell>{email.data.from}</TableCell>
              <TableCell>{email.data.subject}</TableCell>
              {/* Add more cells as needed */}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
