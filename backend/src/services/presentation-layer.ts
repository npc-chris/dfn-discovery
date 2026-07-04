/**
 * Presentation Layer Service
 *
 * Formats recommendations and evidence for user-facing displays.
 * Transforms raw scoring data into compelling, actionable UI presentations.
 *
 * Responsibilities:
 * - Format scores and explanations for UI display
 * - Generate recommendation summaries with key insights
 * - Create detailed evidence narratives
 * - Build performance comparisons across factories
 * - Generate executive summaries and detailed reports
 * - Support multiple output formats (JSON, HTML)
 */

import type { Job, Factory } from '@dfn/shared/types';
import type { ScoringResult } from './core-intelligence';
import {
  SCORING_WEIGHTS,
  SCORING_COMPONENT_LABELS,
  CONFIDENCE_BANDS,
  FIT_BANDS,
  type ConfidenceLevel,
  type FitLevel,
} from '@dfn/shared/constants/scoring';
import { getGeoLogistics } from './geo-logistics';
import { getMarketIntelligence } from './market-intelligence';
import { getSiteRealEstate } from './site-realestate';
import { createAIAnalysisWorkers } from './ai-analysis-workers';
import type { AIProvider } from './ai-providers/types';

/**
 * Converts a camelCase key (as stored in ScoringResult.componentScores)
 * to snake_case (as used in ScoringComponent enum / SCORING_WEIGHTS keys).
 * Example: 'processMatch' -> 'process_match'
 */
function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface RecommendationPresentation {
  recommendationId: string;
  jobId: string;
  rank: number;
  factoryName: string;
  factoryId: string;
  fitScore: number;
  feasibilityScore: number;
  confidenceScore: number;
  confidenceLevel: 'low' | 'medium' | 'high';
  fitDescription: string;
  keyStrengths: string[];
  keyRisks: string[];
  leadTimeEstimate: string;
  costAssessment: string;
  facilityQuality: string;
  nextSteps: string[];
  detailedExplanation: string;
  evidenceHighlights: {
    source: string;
    claim: string;
    confidence: number;
  }[];
  componentBreakdown: {
    label: string;
    score: number;
    weight: number;
    contribution: number;
  }[];
}

export interface JobRecommendationSummary {
  jobId: string;
  jobName: string;
  submittedDate: string;
  status: string;
  totalRecommendations: number;
  topRecommendations: RecommendationPresentation[];
  gatePassed: boolean;
  gateFailureReason?: string;
  analysisComplete: boolean;
  lastUpdated: string;
}

export interface ComparisonTable {
  criteria: string[];
  factories: {
    factoryId: string;
    name: string;
    scores: number[];
    strengths: string[];
    risks: string[];
  }[];
}

// ---------------------------------------------------------------------------
// Internal constants 
// ---------------------------------------------------------------------------

/**
 * Column names shown in the factory comparison table.
 * Internal to Discovery's recommendation report — not a shared concept.
 */
const COMPARISON_CRITERIA = [
  'Fit Score',
  'Feasibility Score',
  'Confidence Score',
  'Process Match',
  'Material Match',
  'Capacity Match',
  'Geo \u0026 Logistics',
  'Market Access',
] as const;

// ---------------------------------------------------------------------------
// PresentationLayer class
// ---------------------------------------------------------------------------

export class PresentationLayer {
  // -------------------------------------------------------------------------
  // Public methods
  // -------------------------------------------------------------------------

  /**
   * Format a single recommendation for UI display.
   * Enriches the raw scoring result with logistics, market, and facility data.
   */
  async formatRecommendation(
    scoringResult: ScoringResult,
    job: Job,
    factory: Factory,
  ): Promise<RecommendationPresentation> {
    const confidenceLevel = this.mapConfidenceLevel(scoringResult.confidenceScore);
    const fitDescription = this.mapFitDescription(scoringResult.fitScore);

    // Build component breakdown for display
    const componentBreakdown = this.buildComponentBreakdown(scoringResult.componentScores);

    // Derive strengths and risks from component scores
    const keyStrengths = this.deriveStrengths(scoringResult, factory);
    const keyRisks = this.deriveRisks(scoringResult, job, factory);

    // Enrich with external service data (graceful fallbacks on failure)
    const leadTimeEstimate = await this.fetchLeadTime(job, factory, scoringResult);
    const costAssessment = await this.fetchCostAssessment(factory, job);
    const facilityQuality = await this.fetchFacilityQuality(factory);

    // Generate explanation narrative
    const detailedExplanation = await this.generateExplanation(
      scoringResult,
      job,
      factory,
      'technical',
    );

    // Build next steps based on confidence and gate status
    const nextSteps = this.buildNextSteps(scoringResult, confidenceLevel);

    // Evidence highlights (top 3 by confidence)
    const evidenceHighlights = this.buildEvidenceHighlights(scoringResult);

    return {
      recommendationId: scoringResult.recommendationId,
      jobId: scoringResult.jobId,
      rank: scoringResult.rank,
      factoryName: factory.factory_name ?? `Factory ${scoringResult.factoryId}`,
      factoryId: scoringResult.factoryId,
      fitScore: scoringResult.fitScore,
      feasibilityScore: scoringResult.feasibilityScore,
      confidenceScore: scoringResult.confidenceScore,
      confidenceLevel,
      fitDescription,
      keyStrengths,
      keyRisks,
      leadTimeEstimate,
      costAssessment,
      facilityQuality,
      nextSteps,
      detailedExplanation,
      evidenceHighlights,
      componentBreakdown,
    };
  }

  /**
   * Format all recommendations for a job as a summary view (dashboard / list).
   */
  formatRecommendationSummary(
    job: Job,
    recommendations: RecommendationPresentation[],
  ): JobRecommendationSummary {
    const gatePassed = recommendations.some((r) => r.fitScore >= 60);
    const gateFailureReason = !gatePassed
      ? 'No recommendations met the minimum fit score threshold (60). Consider expanding factory criteria or improving evidence quality.'
      : undefined;

    return {
      jobId: job.id,
      jobName: `${job.company_name} — ${job.product_name}`,
      submittedDate: job.created_at?.toString() ?? new Date().toISOString(),
      status: job.status ?? 'unknown',
      totalRecommendations: recommendations.length,
      topRecommendations: recommendations.slice(0, 5),
      gatePassed,
      gateFailureReason,
      analysisComplete: job.status === 'recommended' || job.status === 'published',
      lastUpdated: job.updated_at?.toString() ?? new Date().toISOString(),
    };
  }

  /**
   * Generate a human-readable explanation for a recommendation score.
   */
  async generateExplanation(
    scoringResult: ScoringResult,
    job: Job,
    factory: Factory,
    style: 'executive' | 'technical' | 'detailed',
  ): Promise<string> {
    const factoryName = factory.factory_name ?? `Factory ${scoringResult.factoryId}`;
    const { fitScore, confidenceScore, componentScores } = scoringResult;

    // Sort components by score to find top contributors and weak areas
    const ranked = Object.entries(componentScores)
      .map(([key, score]) => ({
        key,
        label: SCORING_COMPONENT_LABELS[key as keyof typeof SCORING_COMPONENT_LABELS] ?? key,
        score: score as number,
        weight: SCORING_WEIGHTS[key as keyof typeof SCORING_WEIGHTS] ?? 0,
      }))
      .sort((a, b) => b.score - a.score);

    const top3 = ranked.slice(0, 3);
    const bottom2 = ranked.slice(-2).filter((c) => c.score < 60);

    // Attempt AI-enhanced narrative for detailed style
    if (style === 'detailed') {
      try {
        const provider = (process.env.AI_PROVIDER ?? 'openai') as AIProvider;
        const apiKey = process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
        const model = process.env.AI_MODEL;
        const ai = createAIAnalysisWorkers(provider, apiKey, model);
        const prompt = this.buildExplanationPrompt(scoringResult, job, factory, top3, bottom2);
        const result = await ai.explainRecommendation({
          scenario: prompt,
          context: { style, fitScore, confidenceScore, factoryName },
        });
        if (result?.explanation) return result.explanation;
      } catch {
        // Fall through to deterministic explanation
      }
    }

    // Deterministic explanation for executive / technical / AI fallback
    return this.buildDeterministicExplanation(
      factoryName,
      job,
      scoringResult,
      top3,
      bottom2,
      style,
    );
  }

  /**
   * Generate a detailed HTML report ready for PDF conversion.
   */
  async generateDetailedReport(
    summary: JobRecommendationSummary,
    recommendations: RecommendationPresentation[],
    format: 'html' | 'json' = 'html',
  ): Promise<string> {
    if (format === 'json') {
      return JSON.stringify({ summary, recommendations }, null, 2);
    }
    return this.buildHtmlReport(summary, recommendations);
  }

  /**
   * Build a comparison table for the top N factories side-by-side.
   */
  buildComparisonTable(
    recommendations: RecommendationPresentation[],
    topN = 3,
  ): ComparisonTable {
    const top = recommendations.slice(0, topN);

    const factories = top.map((r) => {
      const scores = [
        r.fitScore,
        r.feasibilityScore,
        r.confidenceScore,
        ...(r.componentBreakdown.map((c) => c.score)),
      ].slice(0, COMPARISON_CRITERIA.length);

      return {
        factoryId: r.factoryId,
        name: r.factoryName,
        scores,
        strengths: r.keyStrengths.slice(0, 3),
        risks: r.keyRisks.slice(0, 2),
      };
    });

    return { criteria: [...COMPARISON_CRITERIA], factories };
  }

  // -------------------------------------------------------------------------
  // Private helpers — score mapping
  // -------------------------------------------------------------------------

  private mapConfidenceLevel(confidenceScore: number): ConfidenceLevel {
    if (confidenceScore < CONFIDENCE_BANDS.MEDIUM.min) return CONFIDENCE_BANDS.LOW.label;
    if (confidenceScore < CONFIDENCE_BANDS.HIGH.min) return CONFIDENCE_BANDS.MEDIUM.label;
    return CONFIDENCE_BANDS.HIGH.label;
  }

  private mapFitDescription(fitScore: number): FitLevel {
    if (fitScore < FIT_BANDS.FAIR.min) return FIT_BANDS.POOR.label;
    if (fitScore < FIT_BANDS.GOOD.min) return FIT_BANDS.FAIR.label;
    if (fitScore < FIT_BANDS.EXCELLENT.min) return FIT_BANDS.GOOD.label;
    return FIT_BANDS.EXCELLENT.label;
  }

  // -------------------------------------------------------------------------
  // Private helpers — narrative derivation
  // -------------------------------------------------------------------------

  private buildComponentBreakdown(
    componentScores: ScoringResult['componentScores'],
  ): RecommendationPresentation['componentBreakdown'] {
    return Object.entries(componentScores).map(([key, score]) => {
      // key is camelCase (e.g. 'processMatch')
      // SCORING_COMPONENT_LABELS is keyed by camelCase
      // SCORING_WEIGHTS is keyed by snake_case ScoringComponent enum values
      const label = SCORING_COMPONENT_LABELS[key] ?? key;
      const weight = (SCORING_WEIGHTS as Record<string, number>)[toSnakeCase(key)] ?? 0;
      const s = score as number;
      return {
        label,
        score: s,
        weight,
        contribution: Math.round(s * weight),
      };
    });
  }

  private deriveStrengths(scoringResult: ScoringResult, factory: Factory): string[] {
    const strengths: string[] = [];
    const cs = scoringResult.componentScores;

    if (cs.processMatch >= 80)
      strengths.push(`Strong process alignment — factory specialises in the required manufacturing process`);
    else if (cs.processMatch >= 60)
      strengths.push(`Adequate process capabilities for this job type`);

    if (cs.materialMatch >= 80)
      strengths.push(`Excellent material match — factory routinely works with the specified materials`);
    else if (cs.materialMatch >= 60)
      strengths.push(`Acceptable material handling capability`);

    if (cs.capacityMatch >= 70)
      strengths.push(`Capacity well-suited to the requested volume band`);

    if (cs.geographyAndLogistics >= 70)
      strengths.push(`Favourable logistics profile — low transit cost and lead time`);

    if (cs.marketAccess >= 70)
      strengths.push(`Strong market position and track record`);

    if (scoringResult.feasibilityScore >= 75)
      strengths.push(`High overall feasibility score (${scoringResult.feasibilityScore}/100)`);

    const certs = (factory as any).certifications ?? [];
    if (Array.isArray(certs) && certs.length > 0)
      strengths.push(`Holds ${certs.length} relevant certification${certs.length > 1 ? 's' : ''}`);

    return strengths.length > 0
      ? strengths
      : ['Factory meets baseline capability requirements'];
  }

  private deriveRisks(scoringResult: ScoringResult, _job: Job, _factory: Factory): string[] {
    const risks: string[] = [];
    const cs = scoringResult.componentScores;

    if (cs.processMatch < 50)
      risks.push(`Process capability mismatch — verify the factory can handle this specific process`);
    if (cs.materialMatch < 50)
      risks.push(`Material handling experience is limited — confirm with factory directly`);
    if (cs.capacityMatch < 50)
      risks.push(`Capacity may be insufficient for the required volume`);
    if (cs.geographyAndLogistics < 50)
      risks.push(`Logistics complexity is elevated — border crossings or long haul likely`);
    if (cs.marketAccess < 50)
      risks.push(`Limited market signals — insufficient data on factory's order history`);
    if (scoringResult.confidenceScore < 40)
      risks.push(`Low confidence score (${scoringResult.confidenceScore}/100) — evidence is sparse; results should be verified`);
    if (!scoringResult.gatePassed && scoringResult.gateFaiureReason)
      risks.push(`Gate failure: ${scoringResult.gateFaiureReason}`);

    return risks.length > 0
      ? risks
      : ['No critical risks identified — standard due diligence recommended'];
  }

  private buildNextSteps(
    scoringResult: ScoringResult,
    confidenceLevel: 'low' | 'medium' | 'high',
  ): string[] {
    const steps: string[] = [];

    if (confidenceLevel === 'low')
      steps.push('Request additional evidence — current data is insufficient for a confident recommendation');
    if (confidenceLevel !== 'high')
      steps.push('Schedule a site visit or video call to verify capabilities in person');

    steps.push('Request a formal quotation and lead time commitment from the factory');

    if (scoringResult.componentScores.geographyAndLogistics < 65)
      steps.push('Engage a logistics partner to assess routing options and costs');

    steps.push('Share the full analysis report with your procurement team');
    steps.push('Proceed to contract negotiation if the factory meets your criteria');

    return steps;
  }

  private buildEvidenceHighlights(
    scoringResult: ScoringResult,
  ): RecommendationPresentation['evidenceHighlights'] {
    return Object.entries(scoringResult.componentScores)
      .map(([key, score]) => ({
        source: SCORING_COMPONENT_LABELS[key] ?? key,
        claim: `Score: ${score as number}/100 (weight: ${(((SCORING_WEIGHTS as Record<string, number>)[toSnakeCase(key)] ?? 0) * 100).toFixed(0)}%)`,
        confidence: score as number,
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }

  // -------------------------------------------------------------------------
  // Private helpers — external service enrichment
  // -------------------------------------------------------------------------

  private async fetchLeadTime(
    job: Job,
    factory: Factory,
    _scoringResult: ScoringResult,
  ): Promise<string> {
    const geo = getGeoLogistics();
    const assessment = await geo.assessLogistics(job, factory);
    const days = assessment.estimated_lead_days;
    const low = days;
    const high = days + 5;
    return `${low}\u2013${high} business days`;
  }

  private async fetchCostAssessment(factory: Factory, job: Job): Promise<string> {
    try {
      const market = getMarketIntelligence();
      const productType = (job as any).product_name ?? 'general';
      const signals = await market.getMarketSignals(factory, productType);
      const score = market.computeMarketAccessScore(signals);
      if (score >= 75) return 'Cost-competitive';
      if (score >= 50) return 'Market-rate pricing';
      return 'Premium or uncertain pricing — negotiate carefully';
    } catch {
      return 'Cost data unavailable — request a quotation directly';
    }
  }

  private async fetchFacilityQuality(factory: Factory): Promise<string> {
    try {
      const site = getSiteRealEstate();
      const brief = await site.generateSiteBrief(factory);
      const { score } = site.assessFacilityCondition(brief);
      if (score >= 80) return 'Excellent facility condition';
      if (score >= 60) return 'Good facility condition';
      if (score >= 40) return 'Adequate facility condition';
      return 'Facility condition uncertain — site visit recommended';
    } catch {
      return 'Facility data unavailable';
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers — explanation text
  // -------------------------------------------------------------------------

  private buildExplanationPrompt(
    scoringResult: ScoringResult,
    job: Job,
    factory: Factory,
    top3: { label: string; score: number }[],
    weakAreas: { label: string; score: number }[],
  ): string {
    return (
      `Explain why ${factory.factory_name ?? 'this factory'} received a fit score of ` +
      `${scoringResult.fitScore}/100 for manufacturing job "${job.product_name}" ` +
      `(process: ${job.process_type}, material: ${job.material_type}, volume: ${job.volume_band}). ` +
      `Top strengths: ${top3.map((c) => `${c.label} (${c.score}/100)`).join(', ')}. ` +
      (weakAreas.length > 0
        ? `Areas of concern: ${weakAreas.map((c) => `${c.label} (${c.score}/100)`).join(', ')}.`
        : 'No significant weak areas.')
    );
  }

  private buildDeterministicExplanation(
    factoryName: string,
    job: Job,
    scoringResult: ScoringResult,
    top3: { label: string; score: number }[],
    weakAreas: { label: string; score: number }[],
    style: 'executive' | 'technical' | 'detailed',
  ): string {
    const { fitScore, confidenceScore, feasibilityScore } = scoringResult;
    const fitDesc = this.mapFitDescription(fitScore);
    const confDesc = this.mapConfidenceLevel(confidenceScore);

    if (style === 'executive') {
      return (
        `${factoryName} is a ${fitDesc.toLowerCase()} for ${(job as any).product_name ?? 'this job'}. ` +
        `Fit score: ${fitScore}/100. Feasibility: ${feasibilityScore}/100. ` +
        `Confidence: ${confDesc}. ` +
        `Top factors: ${top3.map((c) => c.label).join(', ')}.`
      );
    }

    const lines: string[] = [
      `${factoryName} achieved a fit score of ${fitScore}/100 \u2014 ${fitDesc.toLowerCase()} \u2014 ` +
      `for the ${(job as any).product_name ?? 'job'} (` +
      `${(job as any).process_type ?? 'N/A'}, ` +
      `${(job as any).material_type ?? 'N/A'}, ` +
      `${(job as any).volume_band ?? 'N/A'} volume).`,
      '',
      `Feasibility score: ${feasibilityScore}/100. Confidence: ${confDesc} (${confidenceScore}/100).`,
      '',
      `Key contributing factors:`,
      ...top3.map((c) => `  \u2022 ${c.label}: ${c.score}/100`),
    ];

    if (weakAreas.length > 0) {
      lines.push('', `Areas requiring attention:`);
      lines.push(...weakAreas.map((c) => `  \u2022 ${c.label}: ${c.score}/100 \u2014 below optimal threshold`));
    }

    if (style === 'detailed') {
      const methodologyParts = Object.entries(SCORING_WEIGHTS)
        .map(([snakeKey, weight]) => {
          // SCORING_WEIGHTS keys are snake_case, SCORING_COMPONENT_LABELS keys are camelCase
          const camelKey = snakeKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          const label = SCORING_COMPONENT_LABELS[camelKey] ?? snakeKey;
          return `${label} (${(weight * 100).toFixed(0)}%)`;
        })
        .join(', ');
      lines.push(
        '',
        `Scoring methodology: weighted sum of 6 components \u2014 ${methodologyParts}. ` +
        `Confidence penalty of ${scoringResult.confidencePenalty} points applied for missing data.`,
      );
    }

    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // Private helpers — HTML report
  // -------------------------------------------------------------------------

  private buildHtmlReport(
    summary: JobRecommendationSummary,
    recommendations: RecommendationPresentation[],
  ): string {
    const now = new Date().toISOString();
    const rows = recommendations
      .map(
        (r) =>
          `<tr>
            <td>${r.rank}</td>
            <td>${r.factoryName}</td>
            <td>${r.fitScore}</td>
            <td>${r.feasibilityScore}</td>
            <td>${r.confidenceLevel}</td>
            <td>${r.leadTimeEstimate}</td>
          </tr>`,
      )
      .join('\n');

    const details = recommendations
      .map(
        (r) => `
        <section class="factory-detail" id="factory-${r.factoryId}">
          <h3>#${r.rank} \u2014 ${r.factoryName}</h3>
          <p><strong>Fit:</strong> ${r.fitScore}/100 (${r.fitDescription}) &nbsp;|&nbsp;
             <strong>Feasibility:</strong> ${r.feasibilityScore}/100 &nbsp;|&nbsp;
             <strong>Confidence:</strong> ${r.confidenceLevel} (${r.confidenceScore}/100)</p>
          <p><strong>Lead time:</strong> ${r.leadTimeEstimate} &nbsp;|&nbsp;
             <strong>Cost:</strong> ${r.costAssessment} &nbsp;|&nbsp;
             <strong>Facility:</strong> ${r.facilityQuality}</p>
          <h4>Key Strengths</h4>
          <ul>${r.keyStrengths.map((s) => `<li>${s}</li>`).join('')}</ul>
          <h4>Key Risks</h4>
          <ul>${r.keyRisks.map((s) => `<li>${s}</li>`).join('')}</ul>
          <h4>Explanation</h4>
          <p>${r.detailedExplanation.replace(/\n/g, '<br>')}</p>
          <h4>Recommended Next Steps</h4>
          <ol>${r.nextSteps.map((s) => `<li>${s}</li>`).join('')}</ol>
          <h4>Score Breakdown</h4>
          <table>
            <thead><tr><th>Component</th><th>Score</th><th>Weight</th><th>Contribution</th></tr></thead>
            <tbody>
              ${r.componentBreakdown
            .map(
              (c) =>
                `<tr><td>${c.label}</td><td>${c.score}</td>` +
                `<td>${(c.weight * 100).toFixed(0)}%</td><td>${c.contribution}</td></tr>`,
            )
            .join('')}
            </tbody>
          </table>
        </section>`,
      )
      .join('\n');

    const methodologyParts = Object.entries(SCORING_WEIGHTS)
      .map(([snakeKey, weight]) => {
        const camelKey = snakeKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        const label = SCORING_COMPONENT_LABELS[camelKey] ?? snakeKey;
        return `${label} (${(weight * 100).toFixed(0)}%)`;
      })
      .join(', ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DFN Discovery \u2014 Recommendation Report</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 960px; margin: 0 auto; padding: 2rem; color: #1a1a1a; }
    h1, h2, h3, h4 { color: #0d3b66; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; }
    th, td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f0f4f8; }
    .badge-low { color: #c0392b; } .badge-medium { color: #e67e22; } .badge-high { color: #27ae60; }
    .factory-detail { border-top: 2px solid #0d3b66; padding-top: 1rem; margin-top: 2rem; }
    .meta { color: #666; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>DFN Discovery \u2014 Manufacturing Recommendation Report</h1>
  <p class="meta">Job: <strong>${summary.jobName}</strong> &nbsp;|&nbsp;
     Submitted: ${summary.submittedDate} &nbsp;|&nbsp;
     Generated: ${now}</p>
  <p class="meta">Status: <strong>${summary.status}</strong> &nbsp;|&nbsp;
     Gate passed: <strong>${summary.gatePassed ? 'Yes' : 'No'}</strong>
     ${summary.gateFailureReason ? `&nbsp;|&nbsp; ${summary.gateFailureReason}` : ''}</p>

  <h2>Executive Summary</h2>
  <p>Analysis identified <strong>${summary.totalRecommendations}</strong> candidate ${summary.totalRecommendations === 1 ? 'factory' : 'factories'
      }. The top recommendation is <strong>${recommendations[0]?.factoryName ?? 'N/A'}</strong>
  with a fit score of <strong>${recommendations[0]?.fitScore ?? 'N/A'}/100</strong>.</p>

  <h2>Recommendation Rankings</h2>
  <table>
    <thead>
      <tr><th>Rank</th><th>Factory</th><th>Fit</th><th>Feasibility</th><th>Confidence</th><th>Lead Time</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <h2>Detailed Analysis</h2>
  ${details}

  <h2>Methodology</h2>
  <p>Fit scores are computed using a weighted sum of 6 components:
  ${methodologyParts}.
  A confidence penalty of up to ${(0.15 * 100).toFixed(0)}% per missing data component is applied.
  Recommendations require a minimum confidence score of ${CONFIDENCE_BANDS.MEDIUM.min} for draft status
  and ${CONFIDENCE_BANDS.HIGH.min} for final publication.</p>

  <footer><p class="meta">Generated by DFN Discovery &mdash; ${now}</p></footer>
</body>
</html>`;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: PresentationLayer | null = null;

export function getPresentationLayer(): PresentationLayer {
  if (!instance) {
    instance = new PresentationLayer();
  }
  return instance;
}
