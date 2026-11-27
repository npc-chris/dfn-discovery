import axios from 'axios';

export type PaymentProviderName = 'flutterwave' | 'paystack';

export function resolveFinworldBaseUrl(): string {
  return (
    process.env.FINWORLD_API_URL ||
    process.env.BILLING_API_URL ||
    'http://localhost:4200'
  ).replace(/\/+$/, '');
}

export class FinworldClient {
  public async initializeEscrowDeposit(
    params: {
      rfqId: number | string;
      totalAmount: number;
      tenantId?: number;
      callbackUrl?: string;
      paymentProvider?: PaymentProviderName;
      currency?: string;
    },
    authorizationHeader?: string
  ) {
    const baseUrl = resolveFinworldBaseUrl();
    const res = await axios.post(
      `${baseUrl}/api/v1/escrow/initialize-deposit`,
      {
        rfqId: Number(params.rfqId) || 1,
        totalAmount: params.totalAmount,
        tenantId: params.tenantId ?? 1,
        callbackUrl: params.callbackUrl,
        paymentProvider: params.paymentProvider || 'flutterwave',
        currency: params.currency || 'NGN',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(authorizationHeader ? { Authorization: authorizationHeader } : {}),
        },
        timeout: 10000,
      }
    );
    return res.data;
  }

  public async checkQuota(orgId: string, authorizationHeader?: string) {
    const baseUrl = resolveFinworldBaseUrl();
    const res = await axios.get(`${baseUrl}/v1/quotas/verify`, {
      params: { orgId },
      headers: {
        ...(authorizationHeader ? { Authorization: authorizationHeader } : {}),
      },
      timeout: 5000,
    });
    return res.data;
  }
}

export const finworldClient = new FinworldClient();
