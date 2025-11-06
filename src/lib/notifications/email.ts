import crypto from 'crypto';

type FailurePayload = {
  subject: string;
  body: string;
};

const accessKey = process.env.AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION;
const fromAddress = process.env.SES_FROM_EMAIL;
const toAddress = process.env.SES_TO_EMAIL;

const isConfigured =
  Boolean(accessKey && secretKey && region && fromAddress && toAddress);

export async function sendFailureEmail(payload: FailurePayload) {
  if (!isConfigured) {
    console.warn('SES not configured; skipping failure notification email');
    return;
  }

  try {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, '');
    const date = timestamp.slice(0, 8);

    const host = `email.${region}.amazonaws.com`;
    const endpoint = `https://${host}/v2/email/outbound-emails`;
    const service = 'ses';
    const algorithm = 'AWS4-HMAC-SHA256';

    const body = JSON.stringify({
      Content: {
        Simple: {
          Body: {
            Text: {
              Data: payload.body,
              Charset: 'UTF-8',
            },
          },
          Subject: {
            Data: payload.subject,
            Charset: 'UTF-8',
          },
        },
      },
      Destination: {
        ToAddresses: [toAddress!],
      },
      FromEmailAddress: fromAddress!,
    });

    const hashedPayload = hash(body);
    const canonicalHeaders = [
      `content-type:application/json`,
      `host:${host}`,
      `x-amz-date:${timestamp}`,
      `x-amz-content-sha256:${hashedPayload}`,
    ].join('\n');
    const signedHeaders =
      'content-type;host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      'POST',
      '/v2/email/outbound-emails',
      '',
      canonicalHeaders + '\n',
      signedHeaders,
      hashedPayload,
    ].join('\n');

    const credentialScope = `${date}/${region}/${service}/aws4_request`;
    const stringToSign = [
      algorithm,
      timestamp,
      credentialScope,
      hash(canonicalRequest),
    ].join('\n');

    const signingKey = getSigningKey(
      secretKey!,
      date,
      region!,
      service,
    );
    const signature = crypto
      .createHmac('sha256', signingKey)
      .update(stringToSign, 'utf8')
      .digest('hex');

    const authorizationHeader = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Amz-Date': timestamp,
        'X-Amz-Content-Sha256': hashedPayload,
        Authorization: authorizationHeader,
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn(
        `SES SendEmail failed with status ${response.status}: ${text}`,
      );
    }
  } catch (error) {
    console.error('Failed to send SES notification email:', error);
  }
}

function hash(value: string) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function getSigningKey(
  key: string,
  date: string,
  regionName: string,
  serviceName: string,
) {
  const kDate = crypto
    .createHmac('sha256', `AWS4${key}`)
    .update(date, 'utf8')
    .digest();
  const kRegion = crypto
    .createHmac('sha256', kDate)
    .update(regionName, 'utf8')
    .digest();
  const kService = crypto
    .createHmac('sha256', kRegion)
    .update(serviceName, 'utf8')
    .digest();
  return crypto
    .createHmac('sha256', kService)
    .update('aws4_request', 'utf8')
    .digest();
}

