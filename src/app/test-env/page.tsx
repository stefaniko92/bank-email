'use client';

import { useEffect, useState } from 'react';

export default function TestEnvPage() {
  const [envData, setEnvData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkEnv() {
      try {
        const response = await fetch('/api/v1/debug-env');
        const data = await response.json();
        setEnvData(data);
      } catch (error) {
        console.error('Error checking environment:', error);
      } finally {
        setLoading(false);
      }
    }

    checkEnv();
  }, []);

  if (loading) {
    return <div>Loading environment data...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Environment Variables Test</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <pre className="whitespace-pre-wrap">
          {JSON.stringify(envData, null, 2)}
        </pre>
      </div>
    </div>
  );
} 