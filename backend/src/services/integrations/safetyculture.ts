export interface Inspection {
  id: string;
  templateId: string;
  name: string;
  score: number;
  maxScore: number;
  conductedOn: string;
  failedItems: number;
}

/**
 * Validated API implementation for SafetyCulture (iAuditor).
 */
export class SafetyCultureIntegration {
  private apiKey: string;
  private baseUrl = 'https://api.safetyculture.io';

  constructor() {
    this.apiKey = process.env.SAFETYCULTURE_API_KEY || '';
  }

  private async fetchSC(endpoint: string, options: RequestInit = {}) {
    if (!this.apiKey) {
      return { audits: [] };
    }

    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!res.ok) {
        console.warn(`SafetyCulture API error ${res.status}: ${res.statusText}`);
        return { audits: [] };
      }

      return res.json();
    } catch (err) {
      console.warn('[SafetyCultureIntegration] API request failed:', err);
      return { audits: [] };
    }
  }

  async getInspections(siteId: string): Promise<Inspection[]> {
    const data = await this.fetchSC(`/audits/search?site_id=${siteId}`);
    const audits = Array.isArray(data?.audits) ? data.audits : [];

    return audits
      .map((a: any) => ({
        id: String(a.audit_id ?? ''),
        templateId: String(a.template_id ?? ''),
        name: String(a.name ?? 'Untitled inspection'),
        score: Number.isFinite(Number(a.score)) ? Number(a.score) : 0,
        maxScore: Number.isFinite(Number(a.total_score)) && Number(a.total_score) > 0 ? Number(a.total_score) : 100,
        conductedOn: typeof a.modified_at === 'string' && a.modified_at ? a.modified_at : String(a.created_at ?? ''),
        failedItems: Number.isFinite(Number(a.failed_responses_count)) ? Number(a.failed_responses_count) : 0,
      }))
      .filter((inspection: Inspection) => Boolean(inspection.id && inspection.conductedOn));
  }
}
